#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { zodToJsonSchema as convertZodToJsonSchema } from "zod-to-json-schema"; // Using an alias

const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "done" | "failed"; 
  priority: "high" | "medium" | "low";
  dependsOn?: string[];
  parentId?: string; // Added for subtask hierarchy
  subtaskIds?: string[]; // Added for subtask hierarchy
  failureReason?: string; 
  completedDetails: string; 
}

interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[];
  completed: boolean; 
}

interface TaskManagerFile {
  requests: RequestEntry[];
  metadata?: { 
    lastRequestId: number;
    lastTaskId: number;
  };
}

// Zod Schemas
const RequestPlanningSchema = z.object({
  originalRequest: z.string(),
  splitDetails: z.string().optional(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "medium", "low"]).optional(),
      dependsOn: z.array(z.string()).optional(),
    })
  ),
});

const GetNextTaskSchema = z.object({
  requestId: z.string(),
});

const MarkTaskDoneSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  completedDetails: z.string().optional(),
});

const MarkTaskFailedSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  reason: z.string().optional(),
});

const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

const ListRequestsSchema = z.object({});

const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(
    z.object({ 
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "medium", "low"]).optional(),
      dependsOn: z.array(z.string()).optional(),
    })
  ),
});

const UpdateTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
});

const AddDependencySchema = z.object({
  requestId: z.string(),
  taskId: z.string(), 
  dependsOnTaskId: z.string(), 
});

const RemoveDependencySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  dependsOnTaskId: z.string(),
});

const ValidateDependenciesSchema = z.object({
  requestId: z.string(),
});

const DeleteTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

const AddSubtaskSchema = z.object({
  requestId: z.string(),
  parentTaskId: z.string(),
  subtaskTitle: z.string(),
  subtaskDescription: z.string(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  dependsOn: z.array(z.string()).optional(),
});

const RemoveSubtaskSchema = z.object({
  requestId: z.string(),
  parentTaskId: z.string().optional(), // Optional if we want to allow removing a top-level task that happens to be a subtask ( orphaned )
  subtaskId: z.string(),
});

// Tool Definitions
const REQUEST_PLANNING_TOOL: Tool = {
  name: "request_planning",
  description:
    "Register a new user request and plan its associated tasks. Tasks can include 'title', 'description', 'priority' (high, medium, low), and 'dependsOn' (array of task IDs).",
  inputSchema: convertZodToJsonSchema(RequestPlanningSchema) as any,
};
const GET_NEXT_TASK_TOOL: Tool = {
  name: "get_next_task",
  description:
    "Given a 'requestId', return the next pending task (considering priority and dependencies).",
  inputSchema: convertZodToJsonSchema(GetNextTaskSchema) as any,
};
const MARK_TASK_DONE_TOOL: Tool = {
  name: "mark_task_done",
  description:
    "Mark a given task as done.",
  inputSchema: convertZodToJsonSchema(MarkTaskDoneSchema) as any,
};
const MARK_TASK_FAILED_TOOL: Tool = {
  name: "mark_task_failed",
  description:
    "Mark a given task as failed.",
  inputSchema: convertZodToJsonSchema(MarkTaskFailedSchema) as any,
};
const OPEN_TASK_DETAILS_TOOL: Tool = {
  name: "open_task_details",
  description:
    "Get details of a specific task by 'taskId', including its status, priority, and dependencies.",
  inputSchema: convertZodToJsonSchema(OpenTaskDetailsSchema) as any,
};
const LIST_REQUESTS_TOOL: Tool = {
  name: "list_requests",
  description:
    "List all requests with their basic information and summary of tasks.",
  inputSchema: convertZodToJsonSchema(ListRequestsSchema) as any,
};
const ADD_TASKS_TO_REQUEST_TOOL: Tool = {
  name: "add_tasks_to_request",
  description:
    "Add new tasks to an existing request. Tasks can include 'title', 'description', 'priority', and 'dependsOn'.",
  inputSchema: convertZodToJsonSchema(AddTasksToRequestSchema) as any,
};
const UPDATE_TASK_TOOL: Tool = {
  name: "update_task",
  description:
    "Update an existing task's title, description, or priority.",
  inputSchema: convertZodToJsonSchema(UpdateTaskSchema) as any,
};
const ADD_DEPENDENCY_TOOL: Tool = {
  name: "add_dependency",
  description: "Add a dependency between two tasks in the same request.",
  inputSchema: convertZodToJsonSchema(AddDependencySchema) as any,
};
const REMOVE_DEPENDENCY_TOOL: Tool = {
  name: "remove_dependency",
  description: "Remove a dependency between two tasks.",
  inputSchema: convertZodToJsonSchema(RemoveDependencySchema) as any,
};
const VALIDATE_DEPENDENCIES_TOOL: Tool = {
  name: "validate_dependencies",
  description: "Check all tasks in a request for dependency issues.",
  inputSchema: convertZodToJsonSchema(ValidateDependenciesSchema) as any,
};
const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description:
    "Delete a specific task from a request.",
  inputSchema: convertZodToJsonSchema(DeleteTaskSchema) as any,
};

const ADD_SUBTASK_TOOL: Tool = {
  name: "add_subtask",
  description: "Add a new subtask to a specified parent task within a request.",
  inputSchema: convertZodToJsonSchema(AddSubtaskSchema) as any,
};

const REMOVE_SUBTASK_TOOL: Tool = {
  name: "remove_subtask",
  description: "Remove a subtask and all its descendants. If parentTaskId is provided, it will also be unlinked from that parent.",
  inputSchema: convertZodToJsonSchema(RemoveSubtaskSchema) as any,
};

class TaskManagerServer {
  private requestCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { requests: [] };

  constructor() {
    this.loadTasks();
  }

  private async loadTasks() {
    try {
      const fileContent = await fs.readFile(TASK_FILE_PATH, "utf-8");
      const parsedData = JSON.parse(fileContent) as TaskManagerFile;
      this.data = parsedData;

      if (parsedData.metadata && typeof parsedData.metadata.lastRequestId === 'number' && typeof parsedData.metadata.lastTaskId === 'number') {
        this.requestCounter = parsedData.metadata.lastRequestId;
        this.taskCounter = parsedData.metadata.lastTaskId;
      } else {
        const allTaskIds: number[] = [];
        const allRequestIds: number[] = [];
        for (const req of this.data.requests) {
          const reqNum = Number.parseInt(req.requestId.replace("req-", ""), 10);
          if (!Number.isNaN(reqNum)) {
            allRequestIds.push(reqNum);
          }
          for (const t of req.tasks) {
            const tNum = Number.parseInt(t.id.replace("task-", ""), 10);
            if (!Number.isNaN(tNum)) {
              allTaskIds.push(tNum);
            }
          }
        }
        this.requestCounter = allRequestIds.length > 0 ? Math.max(...allRequestIds) : 0;
        this.taskCounter = allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0;
        this.data.metadata = {
          lastRequestId: this.requestCounter,
          lastTaskId: this.taskCounter,
        };
      }
    } catch (error) {
      this.data = { requests: [], metadata: { lastRequestId: 0, lastTaskId: 0 } };
      this.requestCounter = 0;
      this.taskCounter = 0;
    }
  }

  private async saveTasks() {
    try {
      if (!this.data.metadata) {
        this.data.metadata = { lastRequestId: 0, lastTaskId: 0 };
      }
      this.data.metadata.lastRequestId = this.requestCounter;
      this.data.metadata.lastTaskId = this.taskCounter;

      await fs.writeFile(
        TASK_FILE_PATH,
        JSON.stringify(this.data, null, 2),
        "utf-8"
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("EROFS")) {
        console.error("EROFS: read-only file system. Cannot save tasks.");
        throw error;
      }
      throw error;
    }
  }

  private formatTaskProgressTable(requestId: string): string {
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return "Request not found";

    let table = "\nProgress Status:\n";
    table += "| Task ID | Priority | Title | Description | Status |\n";
    table += "|----------|----------|-------|-------------|----------|\n";

    const taskMap = new Map(req.tasks.map(t => [t.id, t]));
    const processedTaskIds = new Set<string>();

    const formatTaskRowRecursive = (taskId: string, level: number) => {
      if (processedTaskIds.has(taskId)) return; // Avoid processing tasks multiple times if structure is complex
      
      const task = taskMap.get(taskId);
      if (!task) return;

      processedTaskIds.add(taskId);

      let statusDisplay = "";
      switch (task.status) {
        case "pending": statusDisplay = "⏳ Pending"; break;
        case "active": statusDisplay = "🔄 Active"; break;
        case "done": statusDisplay = "✅ Done"; break;
        case "failed": statusDisplay = `❌ Failed${task.failureReason ? ` (${task.failureReason.substring(0,15)}...)` : ''}`; break;
        default: statusDisplay = task.status;
      }
      const priorityDisplay = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
      const dependencyIndicator = (task.dependsOn && task.dependsOn.length > 0) ? " (D)" : "";
      const indent = "  ".repeat(level);
      const subtaskIndicator = (task.subtaskIds && task.subtaskIds.length > 0) ? ` (${task.subtaskIds.length} sub)` : "";
      
      table += `| ${task.id} | ${priorityDisplay} | ${indent}${task.title.substring(0,25 - indent.length)}${dependencyIndicator}${subtaskIndicator} | ${task.description.substring(0,30)}... | ${statusDisplay} |\n`;

      if (task.subtaskIds) {
        for (const subtaskId of task.subtaskIds) {
          formatTaskRowRecursive(subtaskId, level + 1);
        }
      }
    };

    // Get all top-level tasks (no parentId) and sort them by ID for consistent ordering
    const topLevelTasks = req.tasks
      .filter(t => !t.parentId)
      .sort((a,b) => parseInt(a.id.replace("task-", ""), 10) - parseInt(b.id.replace("task-", ""), 10));

    for (const task of topLevelTasks) {
      formatTaskRowRecursive(task.id, 0);
    }
    
    // Append any orphaned tasks (tasks with a parentId that no longer exists or were somehow missed)
    // This is a fallback, ideally all tasks are part of the hierarchy or top-level.
    for (const task of req.tasks) {
        if (!processedTaskIds.has(task.id)) {
            // This task was not processed, meaning it's an orphan or part of a broken link
            // For now, just list it without indentation, or with a special marker
            let statusDisplay = "";
            switch (task.status) {
                case "pending": statusDisplay = "⏳ Pending"; break;
                case "active": statusDisplay = "🔄 Active"; break;
                case "done": statusDisplay = "✅ Done"; break;
                case "failed": statusDisplay = `❌ Failed${task.failureReason ? ` (${task.failureReason.substring(0,15)}...)` : ''}`; break;
                default: statusDisplay = task.status;
            }
            const priorityDisplay = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
            table += `| ${task.id} | ${priorityDisplay} | [Orphaned?] ${task.title.substring(0,15)} | ${task.description.substring(0,30)}... | ${statusDisplay} |\n`;
        }
    }


    return table;
  }

  private formatRequestsList(): string {
    let output = "\nRequests List:\n";
    output +=
      "| Request ID | Original Request | Total Tasks | Done Tasks | Request Status |\n"; 
    output +=
      "|------------|------------------|-------------|------------|----------------|\n";

    for (const req of this.data.requests) {
      const totalTasks = req.tasks.length;
      const terminalTasks = req.tasks.filter((t) => t.status === "done" || t.status === "failed").length;
      const requestStatus = req.completed ? "✅ Completed" : "🔄 In Progress";
      output += `| ${req.requestId} | ${req.originalRequest.substring(0, 30)}${req.originalRequest.length > 30 ? "..." : ""} | ${totalTasks} | ${terminalTasks}/${totalTasks} | ${requestStatus} |\n`;
    }
    return output;
  }

  public async requestPlanning(
    originalRequest: string,
    tasks: { title: string; description: string; priority?: "high" | "medium" | "low"; dependsOn?: string[] }[],
    splitDetails?: string
  ) {
    await this.loadTasks();
    this.requestCounter += 1;
    const requestId = `req-${this.requestCounter}`;

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        status: "pending",
        priority: taskDef.priority || "medium",
        dependsOn: taskDef.dependsOn || [],
        completedDetails: "",
      });
    }

    this.data.requests.push({
      requestId,
      originalRequest,
      splitDetails: splitDetails || originalRequest,
      tasks: newTasks,
      completed: false,
    });

    await this.saveTasks();
    const progressTable = this.formatTaskProgressTable(requestId);

    return {
      status: "planned",
      requestId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        dependsOn: t.dependsOn,
      })),
      message: `Tasks have been successfully added. Please use 'get_next_task' to retrieve the first task.\n${progressTable}`,
    };
  }

  public async getNextTask(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    if (req.completed) return { status: "already_completed", message: "Request already completed." };

    const taskMap = new Map(req.tasks.map(t => [t.id, t]));

    // Helper to check if dependencies are met for a task
    const areDependenciesMet = (task: Task): boolean => {
      if (task.dependsOn && task.dependsOn.length > 0) {
        for (const depId of task.dependsOn) {
          const depTask = taskMap.get(depId);
          if (!depTask || depTask.status !== "done") return false;
        }
      }
      return true;
    };

    let potentialNextTasks: Task[] = [];

    // Prioritize subtasks of active parent tasks
    const activeParentTasks = req.tasks.filter(t => t.status === "active" && t.subtaskIds && t.subtaskIds.length > 0);
    for (const parent of activeParentTasks) {
      for (const subtaskId of parent.subtaskIds!) {
        const subtask = taskMap.get(subtaskId);
        if (subtask && subtask.status === "pending" && areDependenciesMet(subtask)) {
          potentialNextTasks.push(subtask);
        }
      }
    }
    
    // If no actionable subtasks from active parents, consider top-level tasks or subtasks of pending parents (if parent becomes active)
    if (potentialNextTasks.length === 0) {
      potentialNextTasks = req.tasks.filter(task => {
        // Only consider tasks that are not subtasks of an active parent (already handled)
        // or tasks that are top-level, or subtasks whose parent is not active (they can't be processed yet anyway unless parent becomes active)
        const parent = task.parentId ? taskMap.get(task.parentId) : null;
        if (parent && parent.status === "active") return false; // Already handled or should be handled by subtask logic

        return (task.status === "pending" || task.status === "active") && areDependenciesMet(task);
      });
    }
    
    if (potentialNextTasks.length === 0) {
      const allTerminal = req.tasks.every(t => t.status === "done" || t.status === "failed");
      const progressTable = this.formatTaskProgressTable(requestId);
      if (allTerminal) {
        if (!req.completed) {
          req.completed = true;
          await this.saveTasks();
        }
        return {
          status: "all_tasks_terminal_request_completed",
          message: `All tasks are in a terminal state (done or failed), and the request is marked as complete.\n${progressTable}`,
        };
      } else {
        return {
          status: "no_actionable_task",
          message: `No pending or active tasks found with met dependencies. Consider parent task statuses for subtasks.\n${progressTable}`,
        };
      }
    }

    potentialNextTasks.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      // Prioritize subtasks of active parents if any were found in the first pass.
      // This sort primarily applies if multiple subtasks of active parents are available,
      // or if we are in the fallback to general actionable tasks.
      if (a.parentId && taskMap.get(a.parentId)?.status === "active" && !(b.parentId && taskMap.get(b.parentId)?.status === "active")) return -1;
      if (!(a.parentId && taskMap.get(a.parentId)?.status === "active") && b.parentId && taskMap.get(b.parentId)?.status === "active") return 1;
      
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      const idNumA = parseInt(a.id.replace("task-", ""), 10);
      const idNumB = parseInt(b.id.replace("task-", ""), 10);
      return idNumA - idNumB;
    });

    const nextTask = potentialNextTasks[0];
    if (nextTask.status === "pending") {
      // If the chosen next task is a subtask, its parent MUST be active or become active.
      // If parent is pending, make parent active first.
      if (nextTask.parentId) {
        const parent = taskMap.get(nextTask.parentId);
        if (parent && parent.status === "pending") {
           // This case implies the parent itself should have been chosen by the general logic if it was actionable.
           // For simplicity, we assume if a subtask is chosen, its parent is already active or this subtask is effectively top-level for now.
           // More robust logic might make the parent active if it's not.
           // For now, if parent is pending, this subtask shouldn't have been selected unless the parent was also selected.
           // The filtering for subtasks of *active* parents handles this.
           // If a subtask of a *pending* parent is chosen, it means the parent itself is the "next task" conceptually.
           // Let's assume the parent becomes active if a subtask under it is the highest priority overall.
           parent.status = "active";
        }
      }
      nextTask.status = "active";
      await this.saveTasks();
    }

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "next_task",
      task: {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
        priority: nextTask.priority,
        dependsOn: nextTask.dependsOn,
        parentId: nextTask.parentId, // Include parentId
        subtaskIds: nextTask.subtaskIds, // Include subtaskIds
      },
      message: `Next task (Priority: ${nextTask.priority}${nextTask.parentId ? `, Subtask of: ${nextTask.parentId}` : ''}) is ready.\n${progressTable}`,
    };
  }

  public async markTaskDone(
    requestId: string,
    taskId: string,
    completedDetails?: string
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.status === "done") return { status: "already_done", message: "Task is already marked done."};
    if (task.status === "failed") return { status: "already_failed", message: "Task is already marked failed."};

    task.status = "done";
    task.completedDetails = completedDetails || "Completed successfully";
    task.failureReason = undefined; 

    let message = `Task ${task.id} marked done.`;
    
    // Check for parent task auto-completion
    if (task.parentId) {
      const parentTask = req.tasks.find(p => p.id === task.parentId);
      if (parentTask && (parentTask.status === "pending" || parentTask.status === "active")) {
        const allSubtasksTerminal = parentTask.subtaskIds?.every(subId => {
          const sub = req.tasks.find(s => s.id === subId);
          return sub && (sub.status === "done" || sub.status === "failed");
        });
        if (allSubtasksTerminal) {
          parentTask.status = "done"; // Or handle failure propagation differently
          parentTask.completedDetails = "Automatically completed as all subtasks are terminal.";
          message += ` Parent task ${parentTask.id} automatically marked done.`;
          // Potentially recurse or re-check if this parent itself has a parent
        }
      }
    }

    const allTasksInRequestTerminal = req.tasks.every(t => t.status === "done" || t.status === "failed");
    if (allTasksInRequestTerminal && !req.completed) {
      req.completed = true;
      message += ` All tasks in request ${req.requestId} are now in a terminal state, and the request is marked as completed.`;
    }

    await this.saveTasks();
    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_marked_done",
      requestId: req.requestId,
      message: `${message}\n${progressTable}`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dependsOn: task.dependsOn,
        completedDetails: task.completedDetails,
      },
      requestCompleted: req.completed,
    };
  }

  public async markTaskFailed(
    requestId: string,
    taskId: string,
    reason?: string
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.status === "failed") return { status: "already_failed", message: "Task is already marked failed."};
    if (task.status === "done") return { status: "already_done", message: "Task is already marked done. Cannot mark a done task as failed."};

    task.status = "failed";
    task.failureReason = reason || "No reason provided";
    task.completedDetails = ""; 

    let message = `Task ${task.id} marked failed. Reason: ${task.failureReason}.`;

    // Check for parent task auto-completion
    if (task.parentId) {
      const parentTask = req.tasks.find(p => p.id === task.parentId);
      if (parentTask && (parentTask.status === "pending" || parentTask.status === "active")) {
        const allSubtasksTerminal = parentTask.subtaskIds?.every(subId => {
          const sub = req.tasks.find(s => s.id === subId);
          return sub && (sub.status === "done" || sub.status === "failed");
        });
        if (allSubtasksTerminal) {
          // If a subtask fails, should the parent fail or just complete?
          // For now, let's assume parent completes if all subtasks are terminal, regardless of their individual success/failure.
          // A more nuanced approach might mark parent as failed if a critical subtask fails.
          parentTask.status = "done"; 
          parentTask.completedDetails = "Automatically completed as all subtasks are terminal (some may have failed).";
          message += ` Parent task ${parentTask.id} automatically marked done.`;
        }
      }
    }
    
    const allTasksInRequestTerminal = req.tasks.every(t => t.status === "done" || t.status === "failed");
    if (allTasksInRequestTerminal && !req.completed) {
      req.completed = true;
      message += ` All tasks in request ${req.requestId} are now in a terminal state, and the request is marked as completed.`;
    }
    
    await this.saveTasks();
    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_marked_failed",
      requestId: req.requestId,
      message: `${message}\n${progressTable}`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dependsOn: task.dependsOn,
        failureReason: task.failureReason,
      },
      requestCompleted: req.completed,
    };
  }

  public async addDependency(requestId: string, taskId: string, dependsOnTaskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    const dependsOnTask = req.tasks.find((t) => t.id === dependsOnTaskId);

    if (!task) return { status: "error", message: `Task ${taskId} not found` };
    if (!dependsOnTask) return { status: "error", message: `Dependency task ${dependsOnTaskId} not found` };
    if (taskId === dependsOnTaskId) return { status: "error", message: "Task cannot depend on itself" };

    if (!task.dependsOn) task.dependsOn = [];
    if (!task.dependsOn.includes(dependsOnTaskId)) {
      task.dependsOn.push(dependsOnTaskId);
    } else {
      return { status: "no_change", message: `Task ${taskId} already depends on ${dependsOnTaskId}` };
    }
    await this.saveTasks();
    return { status: "dependency_added", message: `Task ${taskId} now depends on ${dependsOnTaskId}` };
  }

  public async removeDependency(requestId: string, taskId: string, dependsOnTaskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);

    if (!task) return { status: "error", message: `Task ${taskId} not found` };
    if (!task.dependsOn || !task.dependsOn.includes(dependsOnTaskId)) {
      return { status: "no_change", message: `Task ${taskId} does not depend on ${dependsOnTaskId}` };
    }

    task.dependsOn = task.dependsOn.filter(id => id !== dependsOnTaskId);
    if (task.dependsOn.length === 0) delete task.dependsOn; 
    
    await this.saveTasks();
    return { status: "dependency_removed", message: `Dependency of task ${taskId} on ${dependsOnTaskId} removed` };
  }

  public async validateDependencies(requestId: string): Promise<{ status: string; issues: string[]; message?: string }> {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", issues: ["Request not found"] };

    const issues: string[] = [];
    const taskMap = new Map(req.tasks.map(task => [task.id, task]));

    for (const task of req.tasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskMap.has(depId)) {
            issues.push(`Task ${task.id} depends on non-existent task ${depId}.`);
          }
        }
      }
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    let cycleFound = false;

    function detectCycle(taskId: string): void {
      if (cycleFound) return; 
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = taskMap.get(taskId);
      if (task && task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskMap.has(depId)) continue; 

          if (!visited.has(depId)) {
            detectCycle(depId);
            if (cycleFound) return;
          } else if (recursionStack.has(depId)) {
            issues.push(`Circular dependency detected: ${taskId} -> ... -> ${depId} -> ${taskId}`);
            cycleFound = true; 
            return;
          }
        }
      }
      recursionStack.delete(taskId);
    }

    for (const task of req.tasks) {
      if (!visited.has(task.id) && !cycleFound) {
        detectCycle(task.id);
      }
    }
    
    if (issues.length > 0) {
      return { status: "validation_failed", issues: Array.from(new Set(issues)), message: `Found ${Array.from(new Set(issues)).length} dependency issues.` };
    }

    return { status: "validation_passed", issues: [], message: "All dependencies are valid." };
  }

  public async openTaskDetails(taskId: string) {
    await this.loadTasks();
    for (const req of this.data.requests) {
      const target = req.tasks.find((t) => t.id === taskId);
      if (target) {
        return {
          status: "task_details",
          requestId: req.requestId,
          originalRequest: req.originalRequest,
          splitDetails: req.splitDetails,
          completed: req.completed,
          task: {
            id: target.id,
            title: target.title,
            description: target.description,
            status: target.status,
            priority: target.priority,
            dependsOn: target.dependsOn,
            parentId: target.parentId, // Ensure parentId is included
            subtaskIds: target.subtaskIds, // Ensure subtaskIds are included
            failureReason: target.failureReason,
            completedDetails: target.completedDetails,
          },
        };
      }
    }
    return { status: "task_not_found", message: "No such task found" };
  }

  public async listRequests() {
    await this.loadTasks();
    const requestsList = this.formatRequestsList();
    return {
      status: "requests_listed",
      message: `Current requests in the system:\n${requestsList}`,
      requests: this.data.requests.map((req) => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
        terminalTasks: req.tasks.filter((t) => t.status === "done" || t.status === "failed").length,
        requestCompleted: req.completed,
      })),
    };
  }

  public async addTasksToRequest(
    requestId: string,
    tasks: { title: string; description: string; priority?: "high" | "medium" | "low"; dependsOn?: string[] }[]
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    if (req.completed) return { status: "error", message: "Cannot add tasks to completed request"};

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        status: "pending",
        priority: taskDef.priority || "medium",
        dependsOn: taskDef.dependsOn || [],
        completedDetails: "",
      });
    }

    req.tasks.push(...newTasks);
    await this.saveTasks();
    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} new tasks to request.\n${progressTable}`,
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        dependsOn: t.dependsOn,
      })),
    };
  }

  public async updateTask(
    requestId: string,
    taskId: string,
    updates: { title?: string; description?: string; priority?: "high" | "medium" | "low" }
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.status === "done" || task.status === "failed")
      return { status: "error", message: `Cannot update task in terminal status ('${task.status}')` };

    if (updates.title) task.title = updates.title;
    if (updates.description) task.description = updates.description;
    if (updates.priority) task.priority = updates.priority;

    await this.saveTasks();
    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_updated",
      message: `Task ${taskId} has been updated.\n${progressTable}`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
      },
    };
  }

  public async deleteTask(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const taskToDelete = req.tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return { status: "error", message: "Task not found" };
    
    // It's generally okay to delete done/failed tasks, but let's keep the original restriction for now
    // unless requirements change. If we allow deleting done/failed, ensure parent completion logic isn't broken.
    // For now, let's assume we might want to prevent deletion of tasks that are part of a completed flow.
    // However, cascade delete should work regardless of status of sub-items if parent is deleted.
    // The original code prevented deletion of done/failed tasks. Let's refine this.
    // If a task is a parent, deleting it should cascade. If it's a subtask, it's handled by removeSubtask or this.
    // The main concern for not deleting done/failed tasks is usually audit/history.
    // For simplicity of cascade, let's allow deletion and let removeTaskAndDescendants handle it.
    // The `removeTaskAndDescendants` does not check status before queuing for deletion.

    const removed = this.removeTaskAndDescendants(req, taskId);

    if (removed) {
      await this.saveTasks();
      const progressTable = this.formatTaskProgressTable(requestId);
      return {
        status: "task_deleted",
        message: `Task ${taskId} and its descendants have been deleted.\n${progressTable}`,
      };
    } else {
      return { status: "error", message: `Failed to delete task ${taskId}. It might have already been deleted or an issue occurred.`};
    }
  }

  public async addSubtask(
    requestId: string,
    parentTaskId: string,
    subtaskTitle: string,
    subtaskDescription: string,
    priority?: "high" | "medium" | "low",
    dependsOn?: string[]
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    if (req.completed) return { status: "error", message: "Cannot add subtask to a completed request" };

    const parentTask = req.tasks.find((t) => t.id === parentTaskId);
    if (!parentTask) return { status: "error", message: `Parent task ${parentTaskId} not found in request ${requestId}` };
    if (parentTask.status === "done" || parentTask.status === "failed") {
      return { status: "error", message: `Cannot add subtask to a parent task in terminal status ('${parentTask.status}')` };
    }

    this.taskCounter += 1;
    const newSubtaskId = `task-${this.taskCounter}`;
    const newSubtask: Task = {
      id: newSubtaskId,
      title: subtaskTitle,
      description: subtaskDescription,
      status: "pending",
      priority: priority || parentTask.priority || "medium",
      dependsOn: dependsOn || [],
      parentId: parentTaskId,
      completedDetails: "",
      subtaskIds: [], // New subtasks don't have their own subtasks initially
    };

    req.tasks.push(newSubtask);

    if (!parentTask.subtaskIds) {
      parentTask.subtaskIds = [];
    }
    parentTask.subtaskIds.push(newSubtaskId);

    await this.saveTasks();
    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "subtask_added",
      parentTaskId,
      subtask: {
        id: newSubtask.id,
        title: newSubtask.title,
        description: newSubtask.description,
        priority: newSubtask.priority,
        dependsOn: newSubtask.dependsOn,
        parentId: newSubtask.parentId,
      },
      message: `Subtask '${newSubtask.title}' added to parent '${parentTask.title}'.\n${progressTable}`,
    };
  }

  // Helper for cascading delete, used by removeSubtask and deleteTask
  private removeTaskAndDescendants(req: RequestEntry, taskIdToRemove: string): boolean {
    const taskMap = new Map(req.tasks.map(t => [t.id, t]));
    const tasksToDelete = new Set<string>();
    const queue = [taskIdToRemove];
    
    if (!taskMap.has(taskIdToRemove)) return false; // Task to remove doesn't exist

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (tasksToDelete.has(currentId)) continue;
      tasksToDelete.add(currentId);
      const task = taskMap.get(currentId);
      if (task && task.subtaskIds) {
        for (const subId of task.subtaskIds) {
          if (taskMap.has(subId)) { // Ensure subtask exists before queueing
             queue.push(subId);
          }
        }
      }
    }

    // Remove from parent's subtaskIds list
    const taskToRemove = taskMap.get(taskIdToRemove);
    if (taskToRemove && taskToRemove.parentId) {
      const parent = taskMap.get(taskToRemove.parentId);
      if (parent && parent.subtaskIds) {
        parent.subtaskIds = parent.subtaskIds.filter(id => id !== taskIdToRemove);
        if (parent.subtaskIds.length === 0) delete parent.subtaskIds;
      }
    }
    
    // Filter out all tasks marked for deletion
    const initialTaskCount = req.tasks.length;
    req.tasks = req.tasks.filter(t => !tasksToDelete.has(t.id));
    
    // Clean up dependencies pointing to any deleted task
    req.tasks.forEach(task => {
      if (task.dependsOn) {
        task.dependsOn = task.dependsOn.filter(depId => !tasksToDelete.has(depId));
        if (task.dependsOn.length === 0) delete task.dependsOn;
      }
      // Also clean up parentId if a parent was deleted (though direct subtaskIds are handled by cascade)
      if (task.parentId && tasksToDelete.has(task.parentId)) {
          delete task.parentId; // Orphan the task if its parent is deleted
      }
    });
    return req.tasks.length < initialTaskCount; // Return true if any task was actually removed
  }

  public async removeSubtask(
    requestId: string,
    subtaskId: string,
    parentTaskId?: string // parentTaskId is optional for flexibility
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const subtaskExists = req.tasks.some(t => t.id === subtaskId);
    if (!subtaskExists) return { status: "error", message: `Subtask ${subtaskId} not found.` };

    if (parentTaskId) {
      const parentTask = req.tasks.find(t => t.id === parentTaskId);
      if (!parentTask) return { status: "error", message: `Specified parent task ${parentTaskId} not found.` };
      if (!parentTask.subtaskIds || !parentTask.subtaskIds.includes(subtaskId)) {
        return { status: "error", message: `Task ${subtaskId} is not a direct subtask of ${parentTaskId}.`};
      }
      // Unlink from this specific parent, actual deletion handled by removeTaskAndDescendants
      // The removeTaskAndDescendants will also handle unlinking from parent if its parentId matches.
    }
    
    const removed = this.removeTaskAndDescendants(req, subtaskId);

    if (removed) {
      await this.saveTasks();
      const progressTable = this.formatTaskProgressTable(requestId);
      return {
        status: "subtask_removed",
        message: `Subtask ${subtaskId} and its descendants have been removed.\n${progressTable}`,
      };
    } else {
      // This case should ideally not be hit if subtaskExists was true, unless removeTaskAndDescendants had an issue.
      return { status: "error", message: `Failed to remove subtask ${subtaskId}. It might have already been removed or an issue occurred.` };
    }
  }
}

const server = new Server(
  {
    name: "task-manager-server",
    version: "2.0.1", 
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const taskManagerServer = new TaskManagerServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    REQUEST_PLANNING_TOOL,
    GET_NEXT_TASK_TOOL,
    MARK_TASK_DONE_TOOL,
    MARK_TASK_FAILED_TOOL,
    OPEN_TASK_DETAILS_TOOL,
    LIST_REQUESTS_TOOL,
    ADD_TASKS_TO_REQUEST_TOOL,
    UPDATE_TASK_TOOL,
    ADD_DEPENDENCY_TOOL,
    REMOVE_DEPENDENCY_TOOL,
    VALIDATE_DEPENDENCIES_TOOL,
    DELETE_TASK_TOOL,
    ADD_SUBTASK_TOOL,
    REMOVE_SUBTASK_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "request_planning": {
        const parsed = RequestPlanningSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { originalRequest, tasks, splitDetails } = parsed.data;
        const result = await taskManagerServer.requestPlanning(originalRequest, tasks, splitDetails);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "get_next_task": {
        const parsed = GetNextTaskSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const result = await taskManagerServer.getNextTask(parsed.data.requestId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "mark_task_done": {
        const parsed = MarkTaskDoneSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, taskId, completedDetails } = parsed.data;
        const result = await taskManagerServer.markTaskDone(requestId, taskId, completedDetails);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "mark_task_failed": {
        const parsed = MarkTaskFailedSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, taskId, reason } = parsed.data;
        const result = await taskManagerServer.markTaskFailed(requestId, taskId, reason);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "add_dependency": {
        const parsed = AddDependencySchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, taskId, dependsOnTaskId } = parsed.data;
        const result = await taskManagerServer.addDependency(requestId, taskId, dependsOnTaskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "remove_dependency": {
        const parsed = RemoveDependencySchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, taskId, dependsOnTaskId } = parsed.data;
        const result = await taskManagerServer.removeDependency(requestId, taskId, dependsOnTaskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "validate_dependencies": {
        const parsed = ValidateDependenciesSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId } = parsed.data;
        const result = await taskManagerServer.validateDependencies(requestId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "open_task_details": {
        const parsed = OpenTaskDetailsSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { taskId } = parsed.data;
        const result = await taskManagerServer.openTaskDetails(taskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "list_requests": {
        const parsed = ListRequestsSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const result = await taskManagerServer.listRequests();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "add_tasks_to_request": {
        const parsed = AddTasksToRequestSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, tasks } = parsed.data;
        const result = await taskManagerServer.addTasksToRequest(requestId, tasks);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "update_task": {
        const parsed = UpdateTaskSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, taskId, title, description, priority } = parsed.data; 
        const result = await taskManagerServer.updateTask(requestId, taskId, { title, description, priority });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "delete_task": {
        const parsed = DeleteTaskSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, taskId } = parsed.data;
        const result = await taskManagerServer.deleteTask(requestId, taskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "add_subtask": {
        const parsed = AddSubtaskSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, parentTaskId, subtaskTitle, subtaskDescription, priority, dependsOn } = parsed.data;
        const result = await taskManagerServer.addSubtask(requestId, parentTaskId, subtaskTitle, subtaskDescription, priority, dependsOn);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "remove_subtask": {
        const parsed = RemoveSubtaskSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.format()}`);
        const { requestId, subtaskId, parentTaskId } = parsed.data;
        const result = await taskManagerServer.removeSubtask(requestId, subtaskId, parentTaskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Task Manager MCP Server running. Saving tasks at: ${TASK_FILE_PATH}`
  );
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

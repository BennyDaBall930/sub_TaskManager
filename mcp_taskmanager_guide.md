# Guide: Using the Enhanced MCP Task Manager

## 1. Introduction

This guide explains how to use the enhanced `mcp-taskmanager`, a Model Context Protocol (MCP) server designed for robust and hierarchical task management. This version builds upon typical task managers by incorporating:

*   **Robust Unique ID Generation:** Persistent request and task counters.
*   **Granular Task Statuses:** `pending`, `active`, `done`, `failed`.
*   **Task Prioritization:** `high`, `medium`, `low`.
*   **Task Dependencies:** Explicit `dependsOn` relationships.
*   **Subtask Hierarchy (New):** Tasks can have parent-child relationships (`parentId`, `subtaskIds`), allowing for complex task breakdown.
*   **Auto-Approval Workflow:** Tasks progress through their lifecycle (e.g., becoming active, then done/failed) without manual approval steps. Parent tasks and entire requests auto-complete when all their constituent parts are terminal.

## 2. Core Concepts

*   **Request:** Represents an overall goal or project. It contains a list of tasks. Identified by a `requestId` (e.g., `req-1`).
*   **Task:** An individual, actionable item within a request. Each task has the following key properties:
    *   `id`: Unique identifier (e.g., `task-1`).
    *   `title`: A concise name for the task.
    *   `description`: Detailed explanation of the task.
    *   `status`: Current state of the task:
        *   `pending`: Newly created, not yet started.
        *   `active`: Currently being worked on or the focus of attention (usually set by `get_next_task`).
        *   `done`: Successfully completed.
        *   `failed`: Attempted but could not be completed.
    *   `priority`: Importance level (`high`, `medium`, `low`). Default is `medium`.
    *   `dependsOn` (optional): An array of task IDs that must be in `done` status before this task can become actionable.
    *   `parentId` (optional): The ID of this task's direct parent. If present, this task is a subtask.
    *   `subtaskIds` (optional): An array of task IDs that are direct children of this task.
    *   `failureReason` (optional): A string explaining why a task failed (if status is `failed`).
    *   `completedDetails` (optional): A string providing details about the completion (if status is `done`).
*   **Hierarchy:** A parent task can be broken down into multiple subtasks. Subtasks can, in turn, have their own subtasks, creating a multi-level hierarchy. This is managed via the `parentId` and `subtaskIds` fields.

## 3. Setting up the Task Manager (Conceptual Guide for AI)

This section outlines the conceptual steps an AI might follow using `sequentialthinking` if it were to manage or initialize the task manager. This is for understanding the server's lifecycle.

*   **Thought 1: Define Goal**
    *   **Action:** "Initialize or ensure the task manager server (`github.com/pashpashpash/mcp-taskmanager`) is running and accessible for use."
*   **Thought 2: Check Server Configuration (Conceptual)**
    *   **Action:** "Verify the server is correctly configured in the MCP client settings (e.g., `cline_mcp_settings.json`). Specifically, ensure it's not `disabled` and the command/args point to the correct `dist/index.js` of the local task manager."
    *   **Note:** An AI wouldn't directly edit this file but would recognize it as a prerequisite for successful operation.
*   **Thought 3: Identify Startup Command (Conceptual)**
    *   **Action:** "Recall or determine the command sequence required to build and start the server. This is typically `cd /path/to/mcp-taskmanager/ && npm run build && node dist/index.js`."
*   **Thought 4: Plan Execution (Conceptual)**
    *   **Action:** "If the server is determined to be not running (e.g., based on previous attempts or lack of active terminal), the next logical step is to request the execution of the startup command sequence."
*   **Thought 5: Verify Server is Running (Conceptual)**
    *   **Action:** "After requesting the startup command, anticipate a confirmation message from the server's console output, such as 'Task Manager MCP Server running. Saving tasks at: /path/to/tasks.json'."
*   **Thought 6: Understand Initial State (Conceptual)**
    *   **Action:** "Recognize that the task manager persists its data in a JSON file (defaulting to `~/Documents/tasks.json` or specified by `TASK_MANAGER_FILE_PATH`). If this file doesn't exist on first run, the server will create it. Subsequent runs will load existing data, maintaining task/request ID counters."

## 4. Available Tools and Usage Guide

The server name to use for these tools is typically `github.com/pashpashpash/mcp-taskmanager` (or as configured in your MCP client settings for the local instance).

---

### `request_planning`
*   **Description:** Registers a new user request and plans its initial set of top-level tasks.
*   **Input Parameters:**
    *   `originalRequest` (string, required): The main goal or description of the request.
    *   `splitDetails` (string, optional): Further details about how the request was broken down. Defaults to `originalRequest`.
    *   `tasks` (array of objects, required): Each object defines a task:
        *   `title` (string, required)
        *   `description` (string, required)
        *   `priority` (enum: "high" | "medium" | "low", optional, defaults to "medium")
        *   `dependsOn` (array of string task IDs, optional)
*   **Example Usage:**
    ```json
    {
      "originalRequest": "Develop new feature X",
      "tasks": [
        { "title": "Design Feature X", "description": "Create design mockups.", "priority": "high" },
        { "title": "Implement Backend", "description": "Code server-side logic.", "priority": "high", "dependsOn": ["task-id-of-design-task"] },
        { "title": "Implement Frontend", "description": "Code client-side UI.", "priority": "high", "dependsOn": ["task-id-of-design-task"] }
      ]
    }
    ```
*   **Expected Output:** Includes `status: "planned"`, `requestId`, `totalTasks`, an array of created `tasks` (with their new IDs, priority, dependsOn), and a `message` with a progress table.
*   **Notes:** Use this for creating the initial set of tasks for a new request. To create subtasks under these, use `add_subtask` after the request is planned.

---

### `get_next_task`
*   **Description:** Retrieves the next actionable task for a given request, considering priorities, dependencies, and subtask hierarchy.
*   **Input Parameters:**
    *   `requestId` (string, required)
*   **Example Usage:**
    ```json
    { "requestId": "req-1" }
    ```
*   **Expected Output:**
    *   If an actionable task is found: `status: "next_task"`, a `task` object (including `id`, `title`, `description`, `priority`, `dependsOn`, `parentId`, `subtaskIds`), and a `message` with progress table. The returned task's status becomes `active`.
    *   If all tasks are terminal: `status: "all_tasks_terminal_request_completed"`. The request is marked completed.
    *   If no actionable tasks (e.g., blocked by dependencies or pending parent tasks): `status: "no_actionable_task"`.
*   **Prioritization Logic:**
    1.  Actionable `pending` subtasks of an `active` parent task are prioritized first.
    2.  If none, other `pending` or `active` tasks (top-level or subtasks whose parents are not yet active) that have their dependencies met are considered.
    3.  Within these groups, tasks are sorted by `priority` (high > medium > low), then by task ID (ascending).

---

### `mark_task_done`
*   **Description:** Marks a specified task as done.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `taskId` (string, required)
    *   `completedDetails` (string, optional): Details about the completion.
*   **Example Usage:**
    ```json
    {
      "requestId": "req-1",
      "taskId": "task-1",
      "completedDetails": "Feature design approved by stakeholders."
    }
    ```
*   **Expected Output:** `status: "task_marked_done"`, `requestId`, updated `task` object (including all its fields like `status: "done"`, `priority`, `dependsOn`, `parentId`, `subtaskIds`, `completedDetails`), a `message` with progress table, and `requestCompleted: true/false`.
*   **Auto-Completion:**
    *   **Parent Task:** If marking this task `done` results in all subtasks of its parent becoming terminal (done/failed), the parent task is automatically marked `done`.
    *   **Request:** If all tasks in the request become terminal, the entire request is automatically marked `completed`.

---

### `mark_task_failed`
*   **Description:** Marks a specified task as failed.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `taskId` (string, required)
    *   `reason` (string, optional): Reason for failure.
*   **Example Usage:**
    ```json
    {
      "requestId": "req-1",
      "taskId": "task-2",
      "reason": "External API unresponsive."
    }
    ```
*   **Expected Output:** `status: "task_marked_failed"`, `requestId`, updated `task` object (including `status: "failed"`, `failureReason`, `priority`, etc.), `message` with progress table, and `requestCompleted: true/false`.
*   **Auto-Completion (Parent):** Similar to `mark_task_done`, if this causes all subtasks of a parent to become terminal, the parent is automatically marked `done` (even if some subtasks failed, the parent's structured work is considered "attempted through its parts").

---

### `add_subtask` (New)
*   **Description:** Adds a new subtask to a specified parent task.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `parentTaskId` (string, required): ID of the task that will be the parent.
    *   `subtaskTitle` (string, required)
    *   `subtaskDescription` (string, required)
    *   `priority` (enum: "high" | "medium" | "low", optional, defaults to parent's priority or "medium")
    *   `dependsOn` (array of string task IDs, optional): Dependencies for this subtask.
*   **Example Usage:**
    ```json
    {
      "requestId": "req-1",
      "parentTaskId": "task-1",
      "subtaskTitle": "Create UI Button",
      "subtaskDescription": "Add a submit button to the form.",
      "priority": "high"
    }
    ```
*   **Expected Output:** `status: "subtask_added"`, `parentTaskId`, new `subtask` object details, and `message` with progress table. The parent task's `subtaskIds` array is updated, and the new subtask gets a `parentId`.

---

### `remove_subtask` (New)
*   **Description:** Removes a subtask and all its descendants. If `parentTaskId` is provided, it also ensures the subtask is unlinked from that specific parent.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `subtaskId` (string, required): The ID of the subtask to remove.
    *   `parentTaskId` (string, optional): The ID of the direct parent. Useful for validation but removal logic primarily uses `subtaskId`.
*   **Example Usage:**
    ```json
    {
      "requestId": "req-1",
      "parentTaskId": "task-1", 
      "subtaskId": "task-3"
    }
    ```
*   **Expected Output:** `status: "subtask_removed"`, `message` with updated progress table.
*   **Cascade Delete:** This tool will delete the specified `subtaskId` and ALL of its subtasks, sub-subtasks, etc., recursively.

---

### `delete_task`
*   **Description:** Deletes a specific task and its entire hierarchy of subtasks from a request.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `taskId` (string, required)
*   **Example Usage:**
    ```json
    { "requestId": "req-1", "taskId": "task-1" }
    ```
*   **Expected Output:** `status: "task_deleted"`, `message` with updated progress table.
*   **Cascade Delete:** If the `taskId` refers to a task that has subtasks, all those subtasks (and their subtasks, etc.) will also be deleted. It also cleans up dependencies pointing to any deleted task and unlinks it from its parent if it was a subtask.

---

### `open_task_details`
*   **Description:** Retrieves detailed information for a specific task.
*   **Input Parameters:**
    *   `taskId` (string, required)
*   **Example Usage:**
    ```json
    { "taskId": "task-1" }
    ```
*   **Expected Output:** `status: "task_details"`, `requestId`, `originalRequest`, `task` object containing all its fields, including `id`, `title`, `description`, `status`, `priority`, `dependsOn`, `parentId`, `subtaskIds`, `failureReason`, `completedDetails`.

---

### `list_requests`
*   **Description:** Lists all requests currently in the system.
*   **Input Parameters:** None.
*   **Example Usage:**
    ```json
    {}
    ```
*   **Expected Output:** `status: "requests_listed"`, `message` containing a table of requests, and an array of `requests` objects (summary info).

---

### `add_tasks_to_request`
*   **Description:** Adds new top-level tasks to an existing request.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `tasks` (array of task definition objects, same as in `request_planning`)
*   **Example Usage:**
    ```json
    {
      "requestId": "req-1",
      "tasks": [{ "title": "Documentation", "description": "Write user docs." }]
    }
    ```
*   **Expected Output:** `status: "tasks_added"`, `message` with progress table, and array of `newTasks` added.

---

### `update_task`
*   **Description:** Updates properties (title, description, priority) of an existing task.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `taskId` (string, required)
    *   `title` (string, optional)
    *   `description` (string, optional)
    *   `priority` (enum: "high" | "medium" | "low", optional)
*   **Example Usage:**
    ```json
    {
      "requestId": "req-1",
      "taskId": "task-1",
      "priority": "high",
      "description": "Updated description for task 1."
    }
    ```
*   **Expected Output:** `status: "task_updated"`, `message` with progress table, and updated `task` object (partial).
*   **Note:** Cannot update tasks in a terminal status (`done` or `failed`).

---

### `add_dependency`
*   **Description:** Adds a `dependsOn` relationship between two tasks in the same request.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `taskId` (string, required): The task that will depend on another.
    *   `dependsOnTaskId` (string, required): The task that `taskId` will depend on.
*   **Example Usage:**
    ```json
    { "requestId": "req-1", "taskId": "task-2", "dependsOnTaskId": "task-1" }
    ```
*   **Expected Output:** `status: "dependency_added"` or an error/no_change message.

---

### `remove_dependency`
*   **Description:** Removes a `dependsOn` relationship.
*   **Input Parameters:**
    *   `requestId` (string, required)
    *   `taskId` (string, required): The task whose dependency is to be removed.
    *   `dependsOnTaskId` (string, required): The task it currently depends on.
*   **Example Usage:**
    ```json
    { "requestId": "req-1", "taskId": "task-2", "dependsOnTaskId": "task-1" }
    ```
*   **Expected Output:** `status: "dependency_removed"` or an error/no_change message.

---

### `validate_dependencies`
*   **Description:** Checks all tasks in a request for dependency issues (e.g., circular dependencies, dependencies on non-existent tasks).
*   **Input Parameters:**
    *   `requestId` (string, required)
*   **Example Usage:**
    ```json
    { "requestId": "req-1" }
    ```
*   **Expected Output:** `status: "validation_passed"` or `status: "validation_failed"` with an array of `issues`.

## 5. Workflow Examples

### Scenario 1: Project with Subtasks

1.  **Plan Request:**
    ```json
    // Tool: request_planning
    {
      "originalRequest": "Launch New Website",
      "tasks": [{ "title": "Website Development", "description": "Oversee all website dev", "priority": "high" }]
    } 
    ```
    (Assume `Website Development` gets ID `task-100` in `req-10`)

2.  **Add Subtasks to `task-100`:**
    ```json
    // Tool: add_subtask
    { "requestId": "req-10", "parentTaskId": "task-100", "subtaskTitle": "Frontend Dev", "subtaskDescription": "Build UI", "priority": "high" }
    // Tool: add_subtask
    { "requestId": "req-10", "parentTaskId": "task-100", "subtaskTitle": "Backend Dev", "subtaskDescription": "Build API", "priority": "high" }
    ```
    (Assume `Frontend Dev` is `task-101`, `Backend Dev` is `task-102`)

3.  **Add Sub-subtask to `task-101` ("Frontend Dev"):**
    ```json
    // Tool: add_subtask
    { "requestId": "req-10", "parentTaskId": "task-101", "subtaskTitle": "Homepage Design", "subtaskDescription": "Design homepage UI", "priority": "high" }
    ```
    (Assume `Homepage Design` is `task-103`)

4.  **Process Tasks:**
    *   `get_next_task` for `req-10` -> `task-100` ("Website Development") becomes active.
    *   `get_next_task` for `req-10` -> `task-101` ("Frontend Dev") becomes active (subtask of active parent).
    *   `get_next_task` for `req-10` -> `task-103` ("Homepage Design") becomes active (subtask of active parent `task-101`).
    *   `mark_task_done` for `task-103`.
        *   **Result:** `task-103` is done. `task-101` ("Frontend Dev") auto-completes to done (as `task-103` was its only subtask).
    *   `get_next_task` for `req-10` -> `task-102` ("Backend Dev") becomes active (other subtask of `task-100`).
    *   `mark_task_done` for `task-102`.
        *   **Result:** `task-102` is done. Now both subtasks of `task-100` (`task-101`, `task-102`) are done. So, `task-100` ("Website Development") auto-completes to done.
        *   Since `task-100` was the only top-level task, request `req-10` also auto-completes.

## 6. Best Practices for AI Usage

*   **Iterative Processing:** For complex requests, use `get_next_task` repeatedly. Don't assume the order of tasks without checking.
*   **Inspect Details:** If a task's context is unclear, use `open_task_details` to fetch its full information, including `parentId` and `subtaskIds`.
*   **Hierarchical Planning:** When a task is large, consider using `add_subtask` to break it down after it becomes active or during initial detailed planning if the AI can map out the hierarchy.
*   **Dependency vs. Hierarchy:**
    *   Use `dependsOn` for strict sequential ordering between any two tasks.
    *   Use parent/subtask relationships for structural decomposition of a larger task into its components. A subtask inherently depends on its parent being active or worked on.
*   **Error Handling:** Always check the `status` field in the response. If it indicates an error, review the `message` or `issues` field.
*   **Idempotency:** Tools like `mark_task_done` on an already done task will return an "already_done" status, preventing unintended state changes.
*   **Understand Auto-Completion:** Be aware that marking a subtask done/failed can trigger its parent to auto-complete, and marking the last task in a request done/failed can complete the entire request. This can simplify flows.

This guide should equip an AI to effectively utilize all features of the enhanced `mcp-taskmanager`.

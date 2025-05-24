# sub_TaskManager: Enhanced MCP Task Manager

An enhanced MCP Task Manager with subtask hierarchy, priorities, dependencies, and an auto-approval workflow. Inspired by and building upon the concepts from [pashpashpash/mcp-taskmanager](https://github.com/pashpashpash/mcp-taskmanager) and originally forked from [kazuph/mcp-taskmanager](https://github.com/kazuph/mcp-taskmanager).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

`sub_TaskManager` is a Node.js and TypeScript-based Model Context Protocol (MCP) server designed for managing complex tasks and projects. It allows for hierarchical task breakdown (tasks with subtasks), prioritization, dependencies between tasks, and features an auto-approval system where tasks and requests progress and complete automatically based on their state and the state of their components.

All task data is persisted locally in a `tasks.json` file.

## Key Features

*   **Subtask Hierarchy:** Organize complex tasks by breaking them into multiple levels of subtasks.
*   **Robust Unique ID Generation:** Persistent and unique IDs for requests and tasks.
*   **Granular Task Statuses:** Track tasks with statuses like `pending`, `active`, `done`, and `failed`.
*   **Task Prioritization:** Assign `high`, `medium`, or `low` priority to tasks.
*   **Task Dependencies:** Define `dependsOn` relationships to manage sequential tasks.
*   **Auto-Approval Workflow:** Tasks transition through their lifecycle, and parent tasks/requests auto-complete when their components are finished, without manual approval steps.
*   **Comprehensive Toolset:** Includes tools for planning, fetching, updating, deleting tasks, managing dependencies, and managing subtasks.
*   **File-based Storage:** Task data is saved in `tasks.json` (defaults to `~/Documents/tasks.json`).

## Prerequisites

*   Node.js (v18.x, v20.x or later recommended)
*   npm (comes with Node.js)

## Installation & Setup

1.  **Clone the repository (once on GitHub):**
    ```bash
    git clone https://github.com/BennyDaBall930/sub_TaskManager.git 
    cd sub_TaskManager
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the project (compile TypeScript):**
    ```bash
    npm run build
    ```
    This will create the compiled JavaScript files in the `dist` directory.

## Running the Server

Execute the compiled server from the project root:

```bash
node dist/index.js
```

By default, the server saves task data to `~/Documents/tasks.json`. You can specify a different location by setting the `TASK_MANAGER_FILE_PATH` environment variable:

```bash
TASK_MANAGER_FILE_PATH=/path/to/your/custom_tasks.json node dist/index.js
```

Upon successful startup, you will see a message like:
`Task Manager MCP Server running. Saving tasks at: /path/to/your/tasks.json`

### MCP Client Integration

To use this server with an MCP client (like the VS Code Claude Dev Extension), you'll need to configure the client to connect to it. For example, in `cline_mcp_settings.json`, you might add an entry like this:

```json
{
  "mcpServers": {
    "mcp-sub_TaskManager": { // Your chosen server name
      "command": "node",
      "args": [
        "/full/path/to/your/sub_TaskManager/dist/index.js" // Ensure this is the absolute path
      ],
      "transportType": "stdio",
      "disabled": false,
      "timeout": 60,
      "autoApprove": [ // Add tools you want to auto-approve
        "request_planning",
        "get_next_task",
        "mark_task_done",
        "mark_task_failed",
        "add_subtask",
        "remove_subtask",
        "delete_task",
        "open_task_details",
        "list_requests",
        "add_tasks_to_request",
        "update_task",
        "add_dependency",
        "remove_dependency",
        "validate_dependencies"
      ]
    }
    // ... other servers
  }
}
```
**Note:** Ensure the `args` path is the absolute path to your `dist/index.js`.

## Available Tools (Summary)

`sub_TaskManager` provides a comprehensive set of tools for task management:

*   **Core Workflow:**
    *   `request_planning`: Create a new request with initial top-level tasks.
    *   `get_next_task`: Fetch the next actionable task based on hierarchy, priority, and dependencies.
    *   `mark_task_done`: Mark a task as completed.
    *   `mark_task_failed`: Mark a task as failed, with a reason.
*   **Subtask Management:**
    *   `add_subtask`: Add a new subtask to an existing parent task.
    *   `remove_subtask`: Remove a subtask and all its descendants.
*   **Task & Request Management:**
    *   `delete_task`: Delete a task and its subtask hierarchy.
    *   `open_task_details`: Get detailed information about a specific task.
    *   `list_requests`: List all current requests.
    *   `add_tasks_to_request`: Add more top-level tasks to an existing request.
    *   `update_task`: Modify a task's title, description, or priority.
*   **Dependency Management:**
    *   `add_dependency`: Create a `dependsOn` link between tasks.
    *   `remove_dependency`: Remove a `dependsOn` link.
    *   `validate_dependencies`: Check for issues like circular dependencies.

For detailed information on each tool's parameters, example usage, and expected outputs, please refer to the [**Full Usage Guide (mcp_taskmanager_guide.md)**](./mcp_taskmanager_guide.md).

## High-Level Usage Example

1.  **Plan a new project:**
    Use `request_planning` to define the main project goal and initial high-level tasks.
    *Example: Create a request "Organize Birthday Party" with a task "Overall Party Planning".*
2.  **Break down tasks:**
    Use `add_subtask` to add subtasks to the "Overall Party Planning" task, like "Guest List", "Venue Booking", "Send Invitations".
    *Example: Add "Guest List" as a subtask to "Overall Party Planning".*
3.  **Process tasks:**
    *   Repeatedly call `get_next_task` to get the next actionable item. The server will prioritize subtasks of active parents.
    *   As tasks are completed, use `mark_task_done`.
    *   If a task cannot be completed, use `mark_task_failed`.
4.  **Observe auto-completion:**
    *   When all subtasks of a parent are done or failed, the parent task will automatically be marked as done.
    *   When all tasks in a request are done or failed, the entire request will be automatically marked as completed.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details (assuming you will add a LICENSE file with MIT content).

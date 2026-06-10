// Kanban Thunderbird UI Logic

document.addEventListener("DOMContentLoaded", function () {
  const kanbanColumns = document.getElementById("kanban-columns");
  const refreshBtn = document.getElementById("refresh-btn");
  const newTaskBtn = document.getElementById("new-task-btn");

  // Define our Kanban columns
  const columns = ["To Do", "In Progress", "Done", "Cancelled"];

  // Initialize the board
  initializeBoard();

  // Listen for background-triggered refresh signals
  browser.runtime.onMessage.addListener(function (request) {
    if (request.action === "refreshBoard") {
      initializeBoard();
    }
  });

  // Refresh button handler
  refreshBtn.addEventListener("click", function () {
    initializeBoard();
  });

  // New task button handler
  newTaskBtn.addEventListener("click", function () {
    browser.runtime.sendMessage({ action: "createTask" }, function (response) {
      if (response.error) {
        alert("Failed to create task: " + response.error);
      } else {
        initializeBoard();
      }
    });
  });

  function initializeBoard() {
    // Clear existing content
    kanbanColumns.innerHTML = "";

    // Create column containers
    columns.forEach((columnName) => {
      const columnDiv = createColumn(columnName);
      kanbanColumns.appendChild(columnDiv);
    });

    // Fetch tasks from background script
    fetchTasks();
  }

  function createColumn(columnName) {
    const columnDiv = document.createElement("div");
    columnDiv.className = "kanban-column";

    const headerDiv = document.createElement("div");
    headerDiv.className = "column-header";
    const heading = document.createElement("h2");
    heading.textContent = columnName;
    headerDiv.appendChild(heading);
    columnDiv.appendChild(headerDiv);

    const contentDiv = document.createElement("div");
    contentDiv.className = "column-content";
    contentDiv.id = `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`;
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-column";
    emptyDiv.textContent = "No tasks";
    contentDiv.appendChild(emptyDiv);
    columnDiv.appendChild(contentDiv);

    return columnDiv;
  }

  function fetchTasks() {
    // Show loading state
    showLoadingState();

    // Send message to background script to get tasks
    browser.runtime.sendMessage({ action: "getTasks" }, function (response) {
      console.log("Getting tasks");
      if (response.error) {
        console.error("Error fetching tasks:", response.error);
        showErrorMessage(response.error);
        return;
      }

      if (response.tasks) {
        console.log("Got some tasks");
        populateColumns(response.tasks);
      }
    });
  }

  function showLoadingState() {
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      contentDiv.textContent = "";
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-column";
      emptyDiv.textContent = "Loading tasks...";
      contentDiv.appendChild(emptyDiv);
    });
  }

  function showErrorMessage(message) {
    // Show error in all columns
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      contentDiv.textContent = "";
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-column";
      emptyDiv.style.color = "red";
      emptyDiv.textContent = "Error: " + message;
      contentDiv.appendChild(emptyDiv);
    });
  }

  function populateColumns(columnsData) {
    // Clear existing tasks
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      contentDiv.textContent = "";
    });

    // Populate each column with tasks
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      const tasks = columnsData[columnName] || [];

      if (tasks.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "empty-column";
        emptyDiv.textContent = "No tasks";
        contentDiv.appendChild(emptyDiv);
        return;
      }

      tasks.forEach((task) => {
        const taskElement = createTaskElement(task);
        contentDiv.appendChild(taskElement);

        // Make task draggable
        taskElement.setAttribute("draggable", "true");
        taskElement.dataset.taskId = task.id;
        taskElement.dataset.fromColumn = columnName;
        taskElement.dataset.calendarId = task.calendarId;

        // Add click listener to open task editor
        taskElement.addEventListener("click", function (e) {
          if (e.target.closest(".task-card")) {
            const card = e.target.closest(".task-card");
            browser.runtime.sendMessage({
              action: "openTask",
              taskId: card.dataset.taskId,
              calendarId: card.dataset.calendarId,
            });
            initializeBoard(); // Refresh to show the change
          }
        });

        // Add drag event listeners
        taskElement.addEventListener("dragstart", handleDragStart);
        taskElement.addEventListener("dragend", handleDragEnd);
      });
    });

    // Add drag over listeners to column containers
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      contentDiv.addEventListener("dragover", handleDragOver);
      contentDiv.addEventListener("dragenter", handleDragEnter);
      contentDiv.addEventListener("dragleave", handleDragLeave);
      contentDiv.addEventListener("drop", handleDrop);
    });
  }

  function createTaskElement(task) {
    const taskDiv = document.createElement("div");
    taskDiv.className = "task-card";

    // Mark overdue if past due date and not completed/cancelled
    if (
      task.dueDate &&
      task.status !== "COMPLETED" &&
      task.status !== "CANCELLED"
    ) {
      const dueDate = new Date(task.dueDate);
      const today = new Date();
      if (dueDate < today) {
        taskDiv.classList.add("overdue");
      }
    }

    const titleDiv = document.createElement("div");
    titleDiv.className = "task-title";
    titleDiv.textContent = task.title;
    taskDiv.appendChild(titleDiv);

    if (task.description) {
      const descDiv = document.createElement("div");
      descDiv.className = "task-description";
      descDiv.textContent = task.description;
      taskDiv.appendChild(descDiv);
    }

    if (task.dueDate) {
      const dueDiv = document.createElement("div");
      dueDiv.className = "task-meta";
      const dueSpan = document.createElement("span");
      dueSpan.className = "task-due";
      const dueDate = new Date(task.dueDate);
      dueSpan.textContent = `Due: ${dueDate.toLocaleDateString()}`;
      dueDiv.appendChild(dueSpan);
      taskDiv.appendChild(dueDiv);
    }

    if (task.category && task.category.length > 0) {
      const catDiv = document.createElement("div");
      catDiv.className = "task-meta";
      const catSpan = document.createElement("span");
      catSpan.className = "task-category";
      catSpan.textContent = `Categories: ${task.category.join(", ")}`;
      catDiv.appendChild(catSpan);
      taskDiv.appendChild(catDiv);
    }

    return taskDiv;
  }

  // Drag and drop handlers
  let draggedTask = null;
  let draggedFromColumn = null;
  let draggedTaskId = null;
  let draggedTaskCalendarId = null;

  function handleDragStart(e) {
    draggedTask = this;
    draggedFromColumn = this.dataset.fromColumn;
    draggedTaskId = this.dataset.taskId;
    draggedTaskCalendarId = this.dataset.calendarId;

    // Add dragging class for visual feedback
    this.classList.add("dragging");

    // Set drag effect
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", this.dataset.taskId);
  }

  function handleDragEnd(e) {
    // Remove dragging class
    this.classList.remove("dragging");

    // Remove dragover classes from all columns
    document.querySelectorAll(".kanban-column").forEach((col) => {
      col.classList.remove("dragover");
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Add dragover visual feedback to column
    const columnContent = this.closest(".column-content");
    if (columnContent) {
      columnContent.parentElement.classList.add("dragover");
    }
    return false;
  }

  function handleDragEnter(e) {
    e.preventDefault();
    // Add visual feedback
    const columnContent = this.closest(".column-content");
    if (columnContent) {
      columnContent.parentElement.classList.add("dragover");
    }
  }

  function handleDragLeave(e) {
    // Remove visual feedback
    const columnContent = this.closest(".column-content");
    if (columnContent) {
      columnContent.parentElement.classList.remove("dragover");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // Remove dragover class
    const columnContent = this.closest(".column-content");
    if (columnContent) {
      columnContent.parentElement.classList.remove("dragover");
    }

    // Get target column
    const targetColumnEl = this.closest(".kanban-column");
    if (!targetColumnEl) return;

    const targetColumnName =
      targetColumnEl.querySelector(".column-header h2").textContent;

    // Don't do anything if dropped in same column
    if (targetColumnName === draggedFromColumn) {
      return;
    }

    // Update the task's category to reflect the new column
    // We'll map column names to category values
    const columnMap = {
      Done: "COMPLETED",
      "To Do": "NEEDS-ACTION",
      "In Progress": "IN-PROCESS",
      Cancelled: "CANCELLED",
    };
    let newCategory = columnMap[targetColumnName];

    // In a more sophisticated implementation, you might have a mapping
    // For example, "To Do" -> "todo", "In Progress" -> "in_progress", etc.

    // Confirm with user before making changes
    // Update the task via background script
    browser.runtime.sendMessage(
      {
        action: "updateTask",
        taskId: draggedTaskId,
        calendarId: draggedTaskCalendarId,
        changes: {
          item: {
            status: newCategory,
          },
        },
      },
      function (response) {
        if (response.error) {
          alert(`Failed to move task: ${response.error}`);
        } else {
          // Optionally, we could update the UI immediately without a full refresh
          // But for simplicity, we'll refresh the board
          initializeBoard(); // Refresh to show the change
        }
      },
    );

    return false;
  }

  // Expose browser object for compatibility
  if (!window.browser) {
    window.browser = window.chrome || browser;
  }
});

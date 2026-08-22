// Kanban Thunderbird UI Logic

document.addEventListener("DOMContentLoaded", function () {
  const kanbanColumns = document.getElementById("kanban-columns");
  const refreshBtn = document.getElementById("refresh-btn");
  const newTaskBtn = document.getElementById("new-task-btn");

  // Define our Kanban columns
  const columns = ["To Do", "In Progress", "Done", "Cancelled"];

  // Store the full unfiltered task data for client-side filtering
  var allColumnsData = null;

  // Track multi-select category filter state
  var selectedCategories = {};

  // Sentinel key and display label for the "Uncategorized" filter option
  var UNCATEGORIZED_KEY = "__uncategorized__";
  var UNCATEGORIZED_LABEL = "Uncategorized";

  // Initialize the board

  // Listen for background-triggered refresh signals
  browser.runtime.onMessage.addListener(function (request) {
    if (request.action === "refreshBoard") {
      refreshBoard();
    }
  });

  // Category filter dropdown and input handlers
  var filterInput = document.getElementById("category-filter");
  var categoryDropdown = document.getElementById("category-dropdown");

  filterInput.addEventListener("input", function () {
    rebuildDropdown(filterInput.value);
    showDropdown();
  });

  filterInput.addEventListener("focus", function () {
    rebuildDropdown(filterInput.value);
    showDropdown();
  });

  filterInput.addEventListener("blur", function () {
    setTimeout(hideDropdown, 150);
  });

  // Prevent blur from hiding dropdown when clicking a dropdown item
  categoryDropdown.addEventListener("mousedown", function (e) {
    e.preventDefault();
  });

  // Refresh button handler
  refreshBtn.addEventListener("click", function () {
    refreshBoard();
  });

  initializeBoard();

  // New task button handler
  newTaskBtn.addEventListener("click", function () {
    browser.runtime.sendMessage({ action: "createTask" }, function (response) {
      if (response.error) {
        alert("Failed to create task: " + response.error);
      } else {
        refreshBoard();
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

  async function refreshBoard() {
    // Clear existing content
    kanbanColumns.innerHTML = "";
    allColumnsData = null;

    // Create column containers
    columns.forEach((columnName) => {
      const columnDiv = createColumn(columnName);
      kanbanColumns.appendChild(columnDiv);
    });

    await fetchTasks();
    applyFilters();
  }

  function createColumn(columnName) {
    const columnDiv = document.createElement("div");
    columnDiv.className = "kanban-column";

    const headerDiv = document.createElement("div");
    headerDiv.className = "column-header";
    const heading = document.createElement("h2");
    heading.textContent = columnName;
    headerDiv.appendChild(heading);

    if (columnName === "Done") {
      const clearBtn = document.createElement("button");
      clearBtn.className = "clear-done-btn";
      clearBtn.textContent = "Clear Done";
      clearBtn.addEventListener("click", clearDoneTasks);
      headerDiv.appendChild(clearBtn);
    }

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

  async function fetchTasks() {
    // Show loading state
    showLoadingState();

    // Send message to background script to get tasks
    const response = await browser.runtime.sendMessage({ action: "getTasks" });
    if (response.error) {
      console.error("Error fetching tasks:", response.error);
      showErrorMessage(response.error);
      return;
    }

    if (response.tasks) {
      populateColumns(response.tasks);
    }
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

  function applyFilters() {
    var selectedKeys = Object.keys(selectedCategories);
    var filteredData = {};

    columns.forEach(function (columnName) {
      var tasks = allColumnsData[columnName] || [];
      if (selectedKeys.length === 0) {
        filteredData[columnName] = tasks;
      } else {
        var hasUncategorized = selectedKeys.indexOf(UNCATEGORIZED_KEY) !== -1;
        filteredData[columnName] = tasks.filter(function (task) {
          var taskCats = task.category || [];
          // Uncategorized tasks match when the sentinel is selected
          if (hasUncategorized && taskCats.length === 0) {
            return true;
          }
          // Match by category name (OR logic)
          return taskCats.some(function (cat) {
            return selectedKeys.indexOf(cat.toLowerCase()) !== -1;
          });
        });
      }
    });

    populateColumns(filteredData);
  }

  function getAllCategories() {
    var seen = {};
    var result = [];
    if (!allColumnsData) return result;
    columns.forEach(function (colName) {
      (allColumnsData[colName] || []).forEach(function (task) {
        (task.category || []).forEach(function (cat) {
          var key = cat.toLowerCase();
          if (!seen[key]) {
            seen[key] = true;
            result.push(cat);
          }
        });
      });
    });
    // If any task has no categories, add the Uncategorized sentinel
    columns.forEach(function (colName) {
      (allColumnsData[colName] || []).forEach(function (task) {
        var taskCats = task.category || [];
        if (taskCats.length === 0 && !seen[UNCATEGORIZED_KEY]) {
          seen[UNCATEGORIZED_KEY] = true;
          result.push(UNCATEGORIZED_KEY);
        }
      });
    });
    return result.sort();
  }

  function rebuildDropdown(filterText) {
    categoryDropdown.textContent = "";
    var allCats = getAllCategories();
    var lowerFilter = filterText.toLowerCase();
    var matched = allCats.filter(function (cat) {
      return cat.toLowerCase().indexOf(lowerFilter) !== -1;
    });

    if (matched.length === 0) {
      var noMatch = document.createElement("li");
      noMatch.className = "no-match";
      noMatch.textContent = "No categories found";
      categoryDropdown.appendChild(noMatch);
      return;
    }

    matched.forEach(function (cat) {
      var key = cat.toLowerCase();
      var isSelected = selectedCategories.hasOwnProperty(key);

      var li = document.createElement("li");
      if (isSelected) {
        li.className = "selected";
      }
      li.dataset.category = cat;

      var checkSpan = document.createElement("span");
      checkSpan.className = "checkmark";
      checkSpan.textContent = "\u2713";
      li.appendChild(checkSpan);

      var label = cat === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : cat;
      li.appendChild(document.createTextNode(label));

      li.addEventListener("click", function () {
        if (selectedCategories.hasOwnProperty(key)) {
          delete selectedCategories[key];
        } else {
          selectedCategories[key] = cat;
        }
        rebuildDropdown(filterInput.value);
        updateFilterBar();
        applyFilters();
      });
      categoryDropdown.appendChild(li);
    });
  }

  function updateFilterBar() {
    var bar = document.getElementById("active-filters");
    bar.textContent = "";
    var keys = Object.keys(selectedCategories);

    if (keys.length === 0) {
      bar.style.display = "none";
      return;
    }

    bar.style.display = "flex";

    // "Clear filters" button
    var clearBtn = document.createElement("button");
    clearBtn.className = "clear-filters-btn";
    clearBtn.textContent = "Clear filters";
    clearBtn.addEventListener("click", function () {
      selectedCategories = {};
      rebuildDropdown(filterInput.value);
      updateFilterBar();
      applyFilters();
    });
    bar.appendChild(clearBtn);

    // One chip per selected category
    keys.forEach(function (key) {
      var cat = selectedCategories[key];
      var displayName = cat === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : cat;
      var chip = document.createElement("span");
      chip.className = "filter-chip";
      chip.style.backgroundColor = getCategoryColor(cat);

      var label = document.createTextNode(displayName);
      chip.appendChild(label);

      var removeBtn = document.createElement("span");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = " \u00D7";
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        delete selectedCategories[key];
        rebuildDropdown(filterInput.value);
        updateFilterBar();
        applyFilters();
      });
      chip.appendChild(removeBtn);

      bar.appendChild(chip);
    });
  }

  function showDropdown() {
    categoryDropdown.style.display = "block";
  }

  function hideDropdown() {
    categoryDropdown.style.display = "none";
  }

  function populateColumns(columnsData) {
    // Store unfiltered data on first load (only if not already a filtered subset)
    if (!allColumnsData) {
      allColumnsData = {};
      columns.forEach(function (columnName) {
        allColumnsData[columnName] = (columnsData[columnName] || []).slice();
      });
    }

    // Clear existing tasks
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      contentDiv.textContent = "";
    });

    // Check if a category filter is active
    var isFilterActive = Object.keys(selectedCategories).length > 0;

    // Populate each column with tasks
    columns.forEach((columnName) => {
      const contentDiv = document.getElementById(
        `${columnName.toLowerCase().replace(/\s+/g, "-")}-content`,
      );
      const tasks = columnsData[columnName] || [];

      if (tasks.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "empty-column";
        emptyDiv.textContent = isFilterActive
          ? "No matching tasks"
          : "No tasks";
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
      task.category.forEach((cat) => {
        const catSpan = document.createElement("span");
        catSpan.className = "task-category";
        catSpan.textContent = cat;
        catSpan.style.backgroundColor = getCategoryColor(cat);
        catDiv.appendChild(catSpan);
      });
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

  function clearDoneTasks() {
    if (!confirm("Delete all completed tasks? This cannot be undone.")) {
      return;
    }
    browser.runtime.sendMessage(
      { action: "clearDoneTasks" },
      function (response) {
        if (response.error) {
          alert(`Failed to clear done tasks: ${response.error}`);
        } else {
          initializeBoard();
        }
      },
    );
  }

  // Generate consistent color from category name using hash
  function getCategoryColor(categoryName) {
    // Uncategorized gets a neutral grey
    if (categoryName === UNCATEGORIZED_KEY) {
      return "hsl(0, 0%, 32%)";
    }
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
      hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 28%)`;
  }

  // Expose browser object for compatibility
  if (!window.browser) {
    window.browser = window.chrome || browser;
  }
});

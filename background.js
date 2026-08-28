// Background script for Tanban Thunderbird extension

browser.spaces.create("Tanban_Board", "tanban.html", {
  title: "Tanban Board",
  defaultIcons: "icons/sidebar.png",
});

// Listen for calendar item changes and notify kanban tabs
browser.calendar.items.onUpdated.addListener(function (item, changeInfo) {
  if (item.type !== "task") return;

  browser.tabs
    .query({ url: browser.runtime.getURL("tanban.html") })
    .then(function (tabs) {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, { action: "refreshBoard" });
      }
    });
});

browser.calendar.items.onCreated.addListener(function (item, changeInfo) {
  if (item.type !== "task") return;

  browser.tabs
    .query({ url: browser.runtime.getURL("tanban.html") })
    .then(function (tabs) {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, { action: "refreshBoard" });
      }
    });
});

browser.calendar.items.onRemoved.addListener(function (item, changeInfo) {
  if (item.type !== "task") return;

  browser.tabs
    .query({ url: browser.runtime.getURL("tanban.html") })
    .then(function (tabs) {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, { action: "refreshBoard" });
      }
    });
});

// Listen for messages from the Kanban UI
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "getTasks") {
    // Forward the request to the calendar experiment API
    browser.calendar.items
      .query({ type: "task" })
      .then(function (items) {
        // Process tasks for Tanban display
        const processedTasks = processTasksForTanban(items);
        sendResponse({ tasks: processedTasks });
      })
      .catch(function (error) {
        console.error("Error fetching tasks:", error);
        sendResponse({ error: error.message });
      });
    // Return true to indicate we'll respond asynchronously
    return true;
  }

  if (request.action === "updateTask") {
    // Update a task's properties (e.g., move to different column)
    browser.calendar.items
      .update(request.calendarId, request.taskId, request.changes)
      .then(function () {
        sendResponse({ success: true });
      })
      .catch(function (error) {
        console.error("Error updating task:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === "openTask") {
    browser.calendar.items
      .openEditor(request.calendarId, request.taskId)
      .then(function () {
        sendResponse({ success: true });
      })
      .catch(function (error) {
        console.error("Error opening task editor:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === "createTask") {
    browser.calendar.items
      .createTask()
      .then(function () {
        sendResponse({ success: true });
      })
      .catch(function (error) {
        console.error("Error opening task create window", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  //make the query specific to complete tasks
  //
  if (request.action === "clearDoneTasks") {
    const tasksToDelete = request.tasks;

    if (Array.isArray(tasksToDelete)) {
      // Per-item catch skips tasks removed between render and click, so one
      // stale reference doesn't fail the whole batch.
      const deletePromises = tasksToDelete.map((t) =>
        browser.calendar.items
          .remove(t.calendarId, t.id)
          .catch(() => null),
      );
      Promise.all(deletePromises)
        .then(function () {
          sendResponse({ success: true });
        })
        .catch(function (error) {
          console.error("Error clearing done tasks:", error);
          sendResponse({ error: error.message });
        });
    } else {
      // Fallback: legacy behavior (no task list provided → clear all completed)
      browser.calendar.items
        .query({ type: "task" })
        .then(function (items) {
          const doneTasks = items.filter(
            (task) => task.item && task.item.status === "COMPLETED",
          );
          const deletePromises = doneTasks.map((task) =>
            browser.calendar.items.remove(task.calendarId, task.id),
          );
          return Promise.all(deletePromises);
        })
        .then(function () {
          sendResponse({ success: true });
        })
        .catch(function (error) {
          console.error("Error clearing done tasks:", error);
          sendResponse({ error: error.message });
        });
    }
    return true;
  }
});

// Helper function to process tasks for Tanban display
function processTasksForTanban(tasks) {
  // Filter only tasks (not events) - though query already filters by type: "task"
  // Group tasks by status/category (we'll infer from available properties)
  const tanbanColumns = {
    "To Do": [],
    "In Progress": [],
    Done: [],
    Cancelled: [],
  };

  const columnMap = {
    COMPLETED: "Done",
    "NEEDS-ACTION": "To Do",
    "IN-PROCESS": "In Progress",
    CANCELLED: "Cancelled",
  };

  tasks.forEach((task) => {
    // Determine column based on task properties
    // This is a simplified example - you'd want to customize based on your needs
    let column = "To Do"; // Default column

    // Try to infer status from available task properties
    // The task object structure comes from the calendar experiment API
    if (task.item && typeof task.item === "object") {
      // Check for status/category properties in the raw item
      // Categories might be an array or a string
      let categories = [];
      if (task.item.categories) {
        if (Array.isArray(task.item.categories)) {
          categories = task.item.categories;
        } else if (typeof task.item.categories === "string") {
          categories = [task.item.categories];
        }
      }

      // Check for completion status
      column =
        task.item.status !== undefined ? columnMap[task.item.status] : "To Do";
    }

    tanbanColumns[column].push({
      id: task.id,
      calendarId: task.calendarId,
      title: task.item.summary || "Untitled Task",
      description: task.item.description || "",
      dueDate: task.item.dueDate || null,
      category: Array.isArray(task.item.categories) ? task.item.categories : [],
      status: task.item.status,
    });
  });

  return tanbanColumns;
}

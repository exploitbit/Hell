const { Telegraf, session: telegrafSession, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION - DIRECT HARDCODED VALUES
// ==========================================
const BOT_TOKEN = '8388773187:AAGeJLg_0U2qj9sg9awJ9aQVdF9klxEiRw4';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = process.env.PORT || 3000;
const WEB_APP_URL = 'https://task-manager-bot.up.railway.app';
const CHAT_ID = 8469993808; // Your specific user ID - now only sends to you

// Initialize Express app
const app = express();

// ==========================================
// 🎨 EXPRESS CONFIGURATION - FIXED
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ CRITICAL FIX: Set up EJS view engine correctly
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ✅ ADDED: Create views directory if it doesn't exist
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) {
    fs.mkdirSync(viewsDir, { recursive: true });
    console.log('📁 Created views directory');
}

// ✅ ADDED: Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('📁 Created public directory');
}

// ✅ ADDED: Write EJS files to views directory
function writeEJSFiles() {
    try {
        // Tasks.ejs
        const tasksEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Global Task Manager - Tasks</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4361ee;
            --primary-light: #4895ef;
            --secondary: #3f37c9;
            --success: #4cc9f0;
            --danger: #f72585;
            --warning: #f8961e;
            --info: #4895ef;
            --light: #f8f9fa;
            --dark: #212529;
            --gray: #6c757d;
            --gray-light: #adb5bd;
            --border-radius: 12px;
            --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            --transition: all 0.3s ease;
            --pink-bg: rgba(255, 182, 193, 0.1);
            --blue-bg: rgba(173, 216, 230, 0.15);
            --blue-bg-hover: rgba(173, 216, 230, 0.25);
            --completed-bg: rgba(108, 117, 125, 0.1);
            --completed-text: #6c757d;
        }
        
        @media (prefers-color-scheme: dark) {
            :root {
                --primary: #5a6ff0;
                --primary-light: #6a80f2;
                --secondary: #4f46e5;
                --success: #5fd3f0;
                --danger: #ff2d8e;
                --warning: #ffa94d;
                --info: #6a80f2;
                --light: #121212;
                --dark: #ffffff;
                --gray: #94a3b8;
                --gray-light: #475569;
                --shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                --pink-bg: rgba(255, 182, 193, 0.05);
                --blue-bg: rgba(173, 216, 230, 0.08);
                --blue-bg-hover: rgba(173, 216, 230, 0.15);
                --completed-bg: rgba(108, 117, 125, 0.2);
                --completed-text: #94a3b8;
            }
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background-color: var(--light);
            color: var(--dark);
            transition: var(--transition);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 14px;
        }
        
        .header {
            background-color: var(--light);
            padding: 8px 16px;
            display: flex;
            align-items: center;
            justify-content: space-around;
            box-shadow: var(--shadow);
            position: sticky;
            top: 0;
            z-index: 100;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .header-action-btn {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            cursor: pointer;
            transition: var(--transition);
            box-shadow: var(--shadow);
            gap: 8px;
            flex: 1;
            max-width: 120px;
            margin: 0 4px;
            text-decoration: none;
        }
        
        .header-action-btn i {
            font-size: 1rem;
        }
        
        .header-action-btn span {
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        .header-action-btn:hover {
            background: var(--primary-light);
            transform: translateY(-2px);
        }
        
        .header-action-btn.active {
            background: var(--secondary);
            box-shadow: 0 0 0 2px var(--primary-light);
        }
        
        @media (max-width: 768px) {
            .header {
                padding: 8px;
                gap: 4px;
            }
            .header-action-btn {
                width: 100%;
                max-width: none;
                padding: 10px;
                margin: 2px;
                border-radius: 12px;
            }
            .header-action-btn span {
                display: block;
                font-size: 0.75rem;
            }
            .header-action-btn i {
                margin-right: 4px;
                font-size: 0.9rem;
            }
        }
        
        .fab {
            position: fixed;
            width: 60px;
            height: 60px;
            background-color: var(--primary);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: var(--transition);
            z-index: 1000;
            border: none;
            bottom: 30px;
            right: 30px;
        }
        
        .fab:hover {
            background-color: var(--primary-light);
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }
        
        @media (max-width: 768px) {
            .fab {
                width: 50px;
                height: 50px;
                font-size: 1.3rem;
                bottom: 20px;
                right: 20px;
            }
        }
        
        .main-content {
            flex-grow: 1;
            padding: 16px;
            overflow-y: auto;
            padding-bottom: 100px;
        }
        
        .content-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        
        .page-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--dark);
        }
        
        .global-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        .time-header {
            background-color: var(--blue-bg);
            padding: 12px;
            border-radius: var(--border-radius);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .current-time {
            font-size: 1rem;
            color: var(--dark);
        }
        
        .current-time i {
            color: var(--primary);
            margin-right: 8px;
        }
        
        .bucket-header {
            display: flex;
            align-items: center;
            margin: 24px 0 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--gray-light);
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .bucket-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .bucket-count {
            background-color: var(--primary);
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
        }
        
        .items-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            width: 100%;
        }
        
        @media (max-width: 1200px) {
            .items-container {
                grid-template-columns: repeat(2, 1fr) !important;
            }
        }
        
        @media (max-width: 768px) {
            .items-container {
                grid-template-columns: 1fr !important;
            }
        }
        
        .task-card {
            background-color: var(--pink-bg);
            border-radius: var(--border-radius);
            padding: 16px;
            box-shadow: var(--shadow);
            transition: var(--transition);
            animation: slideIn 0.3s ease;
            display: flex;
            flex-direction: column;
            min-height: 140px;
            position: relative;
        }
        
        .task-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
        }
        
        .task-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        
        .task-title {
            font-size: 1rem !important;
            font-weight: 600;
            color: var(--dark);
            margin-bottom: 4px;
            line-height: 1.4 !important;
        }
        
        .task-description {
            font-size: 0.8rem !important;
            color: var(--gray);
            margin-bottom: 12px;
            line-height: 1.4 !important;
            flex-grow: 1;
        }
        
        .task-description:empty {
            display: none !important;
            margin-bottom: 0 !important;
        }
        
        .task-actions {
            display: flex;
            gap: 8px;
        }
        
        .action-btn {
            background-color: var(--primary);
            color: white;
            border: none;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: var(--transition);
            font-size: 0.8rem;
            text-decoration: none;
        }
        
        .action-btn:hover {
            background-color: var(--primary);
            transform: scale(1.1);
        }
        
        .action-btn.disabled {
            background-color: var(--gray-light);
            cursor: not-allowed;
            opacity: 0.6;
            pointer-events: none;
        }
        
        .task-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--gray);
            margin-top: auto;
            padding-top: 12px;
        }
        
        .repeat-badge {
            background-color: rgba(67, 97, 238, 0.1);
            color: var(--primary);
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 0.65rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .duration-badge {
            background-color: rgba(108, 117, 125, 0.2);
            color: var(--gray);
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 0.65rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .task-date-range {
            font-size: 0.75rem;
            color: var(--gray);
            margin-right: 8px;
        }
        
        .task-time-range {
            font-size: 0.75rem;
            color: var(--gray);
            font-weight: 500;
        }
        
        .utc-badge {
            background-color: rgba(67, 97, 238, 0.1);
            color: var(--primary);
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 0.6rem;
            font-weight: 600;
            margin-left: 4px;
        }
        
        .time-remaining-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 600;
            display: inline-block;
            margin-top: 8px;
        }
        
        .time-remaining-badge.upcoming {
            background-color: rgba(108, 117, 125, 0.2);
            color: var(--gray);
        }
        
        .time-remaining-badge.starting_soon {
            background-color: rgba(248, 150, 30, 0.1);
            color: var(--warning);
        }
        
        .time-remaining-badge.active {
            background-color: rgba(76, 201, 240, 0.2);
            color: var(--success);
        }
        
        .time-remaining-badge.due {
            background-color: rgba(248, 150, 30, 0.1);
            color: var(--warning);
        }
        
        .time-remaining-badge.overdue {
            background-color: rgba(247, 37, 133, 0.1);
            color: var(--danger);
        }
        
        .subtask-number-badge {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background-color: var(--gray-light);
            color: var(--dark);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: bold;
            transition: var(--transition);
        }
        
        .subtask-number-badge.completed {
            background-color: var(--primary);
            color: white;
        }
        
        .subtask-complete-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            margin-right: 8px;
        }
        
        .edit-subtask-btn, .delete-subtask-btn {
            background: none;
            border: none;
            color: var(--primary);
            cursor: pointer;
            font-size: 0.7rem;
            opacity: 0.7;
            transition: var(--transition);
            padding: 2px 4px;
        }
        
        .edit-subtask-btn:hover, .delete-subtask-btn:hover {
            opacity: 1;
            transform: scale(1.1);
        }
        
        .delete-subtask-btn {
            color: var(--danger);
        }
        
        .subtasks-details {
            margin-top: 12px;
            border-top: 1px solid var(--gray-light);
            padding-top: 12px;
        }
        
        .subtasks-details summary {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 0.85rem;
            color: var(--primary);
            padding: 4px 0;
            transition: var(--transition);
        }
        
        .subtasks-details summary:hover {
            color: var(--primary-light);
        }
        
        .subtasks-content {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(0,0,0,0.05);
        }
        
        @media (prefers-color-scheme: dark) {
            .subtasks-content {
                border-top-color: rgba(255,255,255,0.05);
            }
        }
        
        .subtask-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 8px;
            padding: 8px;
            background: rgba(0,0,0,0.03);
            border-radius: 6px;
        }
        
        @media (prefers-color-scheme: dark) {
            .subtask-item {
                background: rgba(255,255,255,0.05);
            }
        }
        
        .subtask-details-container {
            flex: 1;
            margin-right: 8px;
        }
        
        .subtask-title {
            font-size: 0.85rem;
            color: var(--dark);
            cursor: pointer;
        }
        
        .subtask-completed {
            text-decoration: line-through;
            color: var(--gray);
        }
        
        .subtask-description {
            font-size: 0.75rem;
            color: var(--gray);
            margin-top: 4px;
            padding-left: 8px;
            border-left: 2px solid var(--primary-light);
            line-height: 1.4;
        }
        
        .subtask-actions {
            display: flex;
            align-items: center;
            margin-left: auto;
        }
        
        .progress-display-container {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        
        .progress-circle {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: conic-gradient(var(--primary) 0%, var(--gray-light) 0%);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            flex-shrink: 0;
        }
        
        .progress-circle::before {
            content: '';
            position: absolute;
            width: 26px;
            height: 26px;
            background-color: var(--light);
            border-radius: 50%;
        }
        
        .progress-text {
            font-size: 0.75rem;
            color: var(--gray);
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        }
        
        .modal-content {
            background-color: var(--light);
            border-radius: var(--border-radius);
            width: 90%;
            max-width: 500px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            animation: scaleIn 0.3s ease;
            overflow: hidden;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .modal-header {
            padding: 16px;
            border-bottom: 1px solid var(--gray-light);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .modal-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--dark);
        }
        
        .close-modal {
            background: none;
            border: none;
            font-size: 1.3rem;
            color: var(--gray);
            cursor: pointer;
            transition: var(--transition);
        }
        
        .close-modal:hover {
            color: var(--danger);
        }
        
        .modal-body {
            padding: 16px;
        }
        
        .form-group {
            margin-bottom: 12px;
        }
        
        .form-label {
            display: block;
            margin-bottom: 4px;
            font-weight: 600;
            color: var(--dark);
            font-size: 0.9rem;
        }
        
        .form-input, .form-select, .form-textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--gray-light);
            border-radius: 6px;
            background-color: var(--light);
            color: var(--dark);
            transition: var(--transition);
            font-size: 0.9rem;
        }
        
        .form-input:focus, .form-select:focus, .form-textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.2);
        }
        
        .form-textarea {
            min-height: 80px;
            resize: vertical;
            line-height: 1.4;
        }
        
        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 16px;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition);
            font-size: 0.9rem;
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: white;
        }
        
        .btn-primary:hover {
            background-color: var(--secondary);
        }
        
        .btn-secondary {
            background-color: var(--gray-light);
            color: white;
        }
        
        .btn-secondary:hover {
            background-color: var(--gray);
        }
        
        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--gray);
            grid-column: 1 / -1;
        }
        
        .empty-state i {
            font-size: 2.5rem;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .info-message {
            background-color: var(--blue-bg);
            border-left: 4px solid var(--primary);
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 6px;
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <a href="/tasks" class="header-action-btn active">
            <i class="fas fa-tasks"></i>
            <span>Tasks</span>
        </a>
        <a href="/notes" class="header-action-btn">
            <i class="fas fa-wand-magic-sparkles"></i>
            <span>Notes</span>
        </a>
        <a href="/history" class="header-action-btn">
            <i class="fas fa-history"></i>
            <span>History</span>
        </a>
    </div>

    <button class="fab" onclick="openAddTaskModal()" title="Add Task">
        <i class="fas fa-plus"></i>
    </button>

    <div class="main-content">
        <div class="info-message">
            <i class="fas fa-globe"></i> <strong>Global Mode</strong> - Everyone sees the same tasks and notes
        </div>
        
        <div class="time-header">
            <span class="current-time">
                <i class="fas fa-clock"></i>
                Current UTC Time: <span id="currentTimeDisplay"><%= currentTime %></span> UTC
            </span>
            <span class="current-time">
                <i class="fas fa-calendar"></i>
                <%= currentDate %> UTC
            </span>
        </div>

        <div class="content-header">
            <h1 class="page-title">Today's Global Tasks</h1>
        </div>

        <% if (tasks.length === 0 && completedTasks.length === 0) { %>
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <p>No tasks for today. Click the + button to add a new global task!</p>
            </div>
        <% } else { %>
            <% if (tasks.length > 0) { %>
                <div class="bucket-header">
                    <h2 class="bucket-title">
                        <i class="fas fa-tasks"></i>
                        Active Tasks
                        <span class="bucket-count"><%= tasks.length %></span>
                    </h2>
                </div>

                <div class="items-container">
                    <% tasks.forEach(function(task) { %>
                        <div class="task-card">
                            <div class="task-header">
                                <div style="flex: 1;">
                                    <h3 class="task-title"><%= task.title %></h3>
                                    <div>
                                        <span class="task-date-range"><%= task.dateUTC %></span>
                                        <span class="task-time-range"><%= task.startTimeUTC %> - <%= task.endTimeUTC %></span>
                                        <span class="utc-badge">UTC</span>
                                    </div>
                                    <span class="time-remaining-badge" id="time-<%= task.taskId %>" 
                                          data-start="<%= new Date(task.startDate).getTime() %>" 
                                          data-end="<%= new Date(task.endDate).getTime() %>">
                                        Calculating...
                                    </span>
                                </div>
                                <div class="task-actions">
                                    <button class="action-btn" onclick="openAddSubtaskModal('<%= task.taskId %>')" title="Add Subtask">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                    <form method="POST" action="/api/tasks/<%= task.taskId %>/complete" style="display:inline;">
                                        <button type="submit" class="action-btn" title="Complete Task">
                                            <i class="fas fa-check"></i>
                                        </button>
                                    </form>
                                    <form method="POST" action="/api/tasks/<%= task.taskId %>/delete" style="display:inline;" onsubmit="return confirm('Delete this global task? Everyone will lose it!')">
                                        <button type="submit" class="action-btn" title="Delete Task">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <% if (task.description) { %>
                                <p class="task-description"><%= task.description %></p>
                            <% } %>

                            <% if (task.subtasks && task.subtasks.length > 0) { %>
                                <% 
                                    const completedSubtasks = task.subtasks.filter(s => s.completed === true).length;
                                    const totalSubtasks = task.subtasks.length;
                                    const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
                                %>
                                <div class="progress-display-container">
                                    <div class="progress-circle" style="background: conic-gradient(var(--primary) <%= progress %>%%, var(--gray-light) 0%);">
                                        <span style="font-size: 0.65rem; z-index: 1; color: var(--dark);"><%= progress %>%</span>
                                    </div>
                                    <div class="progress-text">
                                        <%= completedSubtasks %> of <%= totalSubtasks %> subtasks completed
                                    </div>
                                </div>

                                <details class="subtasks-details">
                                    <summary>
                                        <i class="fas fa-tasks"></i>
                                        Subtasks (<%= completedSubtasks %>/<%= totalSubtasks %>)
                                    </summary>
                                    <div class="subtasks-content">
                                        <% task.subtasks.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)).forEach(function(subtask, index) { %>
                                            <div class="subtask-item">
                                                <form method="POST" action="/api/tasks/<%= task.taskId %>/subtasks/<%= subtask.id %>/toggle" style="display:inline;">
                                                    <button type="submit" class="subtask-complete-btn">
                                                        <span class="subtask-number-badge <%= subtask.completed ? 'completed' : '' %>">
                                                            <%= index + 1 %>
                                                        </span>
                                                    </button>
                                                </form>
                                                <div class="subtask-details-container">
                                                    <div class="subtask-title <%= subtask.completed ? 'subtask-completed' : '' %>">
                                                        <%= subtask.title %>
                                                    </div>
                                                    <% if (subtask.description) { %>
                                                        <div class="subtask-description"><%= subtask.description %></div>
                                                    <% } %>
                                                </div>
                                                <div class="subtask-actions">
                                                    <form method="POST" action="/api/tasks/<%= task.taskId %>/subtasks/<%= subtask.id %>/delete" style="display:inline;" onsubmit="return confirm('Delete this subtask?')">
                                                        <button type="submit" class="delete-subtask-btn" title="Delete Subtask">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                    </form>
                                                </div>
                                            </div>
                                        <% }); %>
                                    </div>
                                </details>
                            <% } else { %>
                                <div style="margin-top: 10px;">
                                    <button class="action-btn" onclick="openAddSubtaskModal('<%= task.taskId %>')" style="border-radius: 20px; width: auto; padding: 0 12px;">
                                        <i class="fas fa-plus"></i> Add Subtask
                                    </button>
                                </div>
                            <% } %>

                            <div class="task-meta">
                                <span class="repeat-badge">
                                    <i class="fas fa-repeat"></i>
                                    <%= task.repeat && task.repeat !== 'none' ? (task.repeat === 'daily' ? 'Daily' : 'Weekly') : 'No Repeat' %>
                                    <% if (task.repeatCount && task.repeatCount > 0) { %>(<%= task.repeatCount %> left)<% } %>
                                </span>
                                <span class="duration-badge">
                                    <i class="fas fa-hourglass-half"></i>
                                    <%= task.durationFormatted || task.duration + ' min' || '30 min' %>
                                </span>
                            </div>
                        </div>
                    <% }); %>
                </div>
            <% } %>

            <% if (completedTasks.length > 0) { %>
                <div class="bucket-header" style="margin-top: 40px;">
                    <h2 class="bucket-title">
                        <i class="fas fa-check-circle"></i>
                        Completed Today
                        <span class="bucket-count"><%= completedTasks.length %></span>
                    </h2>
                </div>

                <div class="items-container">
                    <% completedTasks.forEach(function(task) { %>
                        <div class="task-card" style="opacity: 0.8; background-color: var(--completed-bg);">
                            <div class="task-header">
                                <div style="flex: 1;">
                                    <h3 class="task-title" style="color: var(--completed-text);"><%= task.title %></h3>
                                    <div>
                                        <span class="task-date-range"><%= task.dateUTC %></span>
                                        <span class="task-time-range">Completed at <%= task.completedTimeUTC %> UTC</span>
                                        <span class="utc-badge">UTC</span>
                                    </div>
                                </div>
                            </div>
                            <% if (task.description) { %>
                                <p class="task-description" style="color: var(--completed-text);"><%= task.description %></p>
                            <% } %>
                            <div class="task-meta" style="margin-top: 8px;">
                                <span style="color: var(--completed-text);">
                                    <i class="fas fa-check-circle"></i> Completed
                                </span>
                                <% if (task.autoCompleted) { %>
                                    <span style="color: var(--completed-text);">
                                        <i class="fas fa-robot"></i> Auto-completed
                                    </span>
                                <% } %>
                            </div>
                        </div>
                    <% }); %>
                </div>
            <% } %>
        <% } %>
    </div>

    <!-- Add Task Modal - BOT STYLE FIELDS -->
    <div class="modal" id="addTaskModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Add New Global Task</h2>
                <button type="button" class="close-modal" onclick="closeAddTaskModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form method="POST" action="/api/tasks">
                    <div class="form-group">
                        <label class="form-label">Title * (Max 100 chars)</label>
                        <input type="text" class="form-input" name="title" required placeholder="Enter task title" maxlength="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Description (Max 100 words)</label>
                        <textarea class="form-textarea" name="description" placeholder="Enter task description, or '-' for none"></textarea>
                        <small style="color: var(--gray); font-size: 0.75rem;">Enter '-' if no description</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Start Date (UTC)</label>
                        <input type="date" class="form-input" name="startDate" id="startDate" required>
                        <small style="color: var(--gray); font-size: 0.75rem;">Format: YYYY-MM-DD (UTC)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Start Time (UTC)</label>
                        <input type="time" class="form-input" name="startTime" id="startTime" required>
                        <small style="color: var(--gray); font-size: 0.75rem;">Format: HH:MM (24-hour UTC)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Duration (minutes) or End Time</label>
                        <input type="text" class="form-input" name="duration" id="duration" value="30" placeholder="e.g., 30 or 16:30" required>
                        <small style="color: var(--gray); font-size: 0.75rem;">Enter minutes (15-1440) OR end time in HH:MM format</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Repeat</label>
                        <select class="form-select" name="repeat" id="repeatSelect">
                            <option value="none">No Repeat</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                        </select>
                    </div>
                    <div class="form-group" id="repeatCountGroup" style="display: none;">
                        <label class="form-label">Repeat Count (1-365)</label>
                        <input type="number" class="form-input" name="repeatCount" value="10" min="1" max="365">
                        <small style="color: var(--gray); font-size: 0.75rem;">Number of times to repeat</small>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeAddTaskModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Task</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Add Subtask Modal -->
    <div class="modal" id="addSubtaskModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Add Subtask</h2>
                <button type="button" class="close-modal" onclick="closeAddSubtaskModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form method="POST" action="" id="addSubtaskForm">
                    <div class="form-group">
                        <label class="form-label">Subtask Title * (Max 100 chars)</label>
                        <input type="text" class="form-input" name="title" required placeholder="Enter subtask title" maxlength="100">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <textarea class="form-textarea" name="description" placeholder="Optional description"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeAddSubtaskModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add Subtask</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script>
        // Set default date and time to today/now UTC
        document.addEventListener('DOMContentLoaded', function() {
            const now = new Date();
            const year = now.getUTCFullYear();
            const month = String(now.getUTCMonth() + 1).padStart(2, '0');
            const day = String(now.getUTCDate()).padStart(2, '0');
            const today = \`\${year}-\${month}-\${day}\`;
            const hours = String(now.getUTCHours()).padStart(2, '0');
            const minutes = String(now.getUTCMinutes()).padStart(2, '0');
            const currentTime = \`\${hours}:\${minutes}\`;
            
            const startDateInput = document.getElementById('startDate');
            const startTimeInput = document.getElementById('startTime');
            
            if (startDateInput) startDateInput.value = today;
            if (startTimeInput) startTimeInput.value = currentTime;
            
            // Repeat select toggle
            const repeatSelect = document.getElementById('repeatSelect');
            const repeatCountGroup = document.getElementById('repeatCountGroup');
            
            if (repeatSelect && repeatCountGroup) {
                repeatSelect.addEventListener('change', function() {
                    repeatCountGroup.style.display = this.value === 'none' ? 'none' : 'block';
                });
            }
            
            updateAllTimeRemaining();
            setInterval(updateAllTimeRemaining, 60000);
        });

        function updateAllTimeRemaining() {
            document.querySelectorAll('[id^="time-"]').forEach(el => {
                const startTime = parseInt(el.dataset.start);
                const endTime = parseInt(el.dataset.end);
                const now = Date.now();
                
                let text = '';
                let className = '';
                
                if (now < startTime) {
                    const minutesLeft = Math.ceil((startTime - now) / 60000);
                    if (minutesLeft > 120) {
                        text = 'Upcoming';
                        className = 'upcoming';
                    } else {
                        text = \`Starts in \${minutesLeft}m\`;
                        className = 'starting_soon';
                    }
                } else if (now >= startTime && now <= endTime) {
                    const minutesLeft = Math.ceil((endTime - now) / 60000);
                    text = \`\${minutesLeft}m left\`;
                    className = 'active';
                } else if (now > endTime) {
                    const minutesOver = Math.ceil((now - endTime) / 60000);
                    if (minutesOver < 120) {
                        text = \`Due \${minutesOver}m ago\`;
                        className = 'due';
                    } else {
                        text = 'Overdue';
                        className = 'overdue';
                    }
                }
                
                el.textContent = text;
                el.className = 'time-remaining-badge ' + className;
            });
        }

        function openAddTaskModal() {
            document.getElementById('addTaskModal').style.display = 'flex';
        }

        function closeAddTaskModal() {
            document.getElementById('addTaskModal').style.display = 'none';
        }

        function openAddSubtaskModal(taskId) {
            const form = document.getElementById('addSubtaskForm');
            form.action = \`/api/tasks/\${taskId}/subtasks\`;
            document.getElementById('addSubtaskModal').style.display = 'flex';
        }

        function closeAddSubtaskModal() {
            document.getElementById('addSubtaskModal').style.display = 'none';
            document.getElementById('addSubtaskForm').reset();
        }

        window.addEventListener('click', function(event) {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                    if (modal.id === 'addSubtaskModal') {
                        document.getElementById('addSubtaskForm').reset();
                    }
                }
            });
        });
    </script>
</body>
</html>`;
        fs.writeFileSync(path.join(viewsDir, 'tasks.ejs'), tasksEJS);
        
        // Notes.ejs
        const notesEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Global Task Manager - Notes</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4361ee;
            --primary-light: #4895ef;
            --secondary: #3f37c9;
            --success: #4cc9f0;
            --danger: #f72585;
            --warning: #f8961e;
            --info: #4895ef;
            --light: #f8f9fa;
            --dark: #212529;
            --gray: #6c757d;
            --gray-light: #adb5bd;
            --border-radius: 12px;
            --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            --transition: all 0.3s ease;
            --note-bg: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            --note-shadow: 0 8px 32px rgba(31, 38, 135, 0.1);
        }
        
        @media (prefers-color-scheme: dark) {
            :root {
                --primary: #5a6ff0;
                --primary-light: #6a80f2;
                --secondary: #4f46e5;
                --success: #5fd3f0;
                --danger: #ff2d8e;
                --warning: #ffa94d;
                --info: #6a80f2;
                --light: #121212;
                --dark: #ffffff;
                --gray: #94a3b8;
                --gray-light: #475569;
                --shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                --note-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                --note-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background-color: var(--light);
            color: var(--dark);
            transition: var(--transition);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 14px;
        }
        
        .header {
            background-color: var(--light);
            padding: 8px 16px;
            display: flex;
            align-items: center;
            justify-content: space-around;
            box-shadow: var(--shadow);
            position: sticky;
            top: 0;
            z-index: 100;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .header-action-btn {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            cursor: pointer;
            transition: var(--transition);
            box-shadow: var(--shadow);
            gap: 8px;
            flex: 1;
            max-width: 120px;
            margin: 0 4px;
            text-decoration: none;
        }
        
        .header-action-btn i {
            font-size: 1rem;
        }
        
        .header-action-btn span {
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        .header-action-btn:hover {
            background: var(--primary-light);
            transform: translateY(-2px);
        }
        
        .header-action-btn.active {
            background: var(--secondary);
            box-shadow: 0 0 0 2px var(--primary-light);
        }
        
        @media (max-width: 768px) {
            .header {
                padding: 8px;
                gap: 4px;
            }
            .header-action-btn {
                width: 100%;
                max-width: none;
                padding: 10px;
                margin: 2px;
                border-radius: 12px;
            }
            .header-action-btn span {
                display: block;
                font-size: 0.75rem;
            }
            .header-action-btn i {
                margin-right: 4px;
                font-size: 0.9rem;
            }
        }
        
        .fab {
            position: fixed;
            width: 60px;
            height: 60px;
            background-color: var(--primary);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: var(--transition);
            z-index: 1000;
            border: none;
            bottom: 30px;
            right: 30px;
        }
        
        .fab:hover {
            background-color: var(--primary-light);
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }
        
        @media (max-width: 768px) {
            .fab {
                width: 50px;
                height: 50px;
                font-size: 1.3rem;
                bottom: 20px;
                right: 20px;
            }
        }
        
        .main-content {
            flex-grow: 1;
            padding: 16px;
            overflow-y: auto;
            padding-bottom: 100px;
        }
        
        .content-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        
        .page-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--dark);
        }
        
        .global-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        .info-message {
            background-color: rgba(67, 97, 238, 0.1);
            border-left: 4px solid var(--primary);
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 6px;
            font-size: 0.85rem;
        }
        
        .notes-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }
        
        .note-card {
            background: var(--note-bg);
            border-radius: var(--border-radius);
            padding: 0;
            box-shadow: var(--note-shadow);
            transition: var(--transition);
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            overflow: hidden;
        }
        
        .note-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }
        
        .note-details {
            width: 100%;
        }
        
        .note-summary {
            list-style: none;
            padding: 16px;
            cursor: pointer;
        }
        
        .note-summary::-webkit-details-marker {
            display: none;
        }
        
        .note-header {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        
        .note-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--dark);
            margin-bottom: 4px;
            line-height: 1.3;
        }
        
        .note-date {
            font-size: 0.75rem;
            color: var(--gray);
            font-weight: 500;
        }
        
        .utc-badge {
            background-color: rgba(67, 97, 238, 0.1);
            color: var(--primary);
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 0.6rem;
            font-weight: 600;
            margin-left: 4px;
        }
        
        .note-content {
            padding: 0 16px 16px 16px;
            border-top: 1px solid rgba(0,0,0,0.05);
            margin-top: 8px;
        }
        
        @media (prefers-color-scheme: dark) {
            .note-content {
                border-top-color: rgba(255,255,255,0.05);
            }
        }
        
        .note-description {
            font-size: 0.9rem;
            color: var(--dark);
            line-height: 1.6;
            margin-bottom: 16px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .note-description strong {
            font-weight: 700;
            color: var(--primary);
        }
        
        .note-description em {
            font-style: italic;
            color: var(--secondary);
        }
        
        .note-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: auto;
            padding-top: 12px;
            border-top: 1px solid rgba(0,0,0,0.05);
            flex-wrap: wrap;
            gap: 8px;
        }
        
        @media (prefers-color-scheme: dark) {
            .note-footer {
                border-top-color: rgba(255,255,255,0.05);
            }
        }
        
        .note-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .note-date-badge {
            background: rgba(67, 97, 238, 0.1);
            color: var(--primary);
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 500;
        }
        
        .note-actions {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .note-action-btn, .note-move-btn {
            background: none;
            border: none;
            color: var(--primary);
            cursor: pointer;
            font-size: 0.9rem;
            transition: var(--transition);
            opacity: 0.7;
            padding: 4px;
            border-radius: 4px;
        }
        
        .note-action-btn:hover, .note-move-btn:hover {
            opacity: 1;
            transform: scale(1.1);
            background: rgba(67, 97, 238, 0.1);
        }
        
        .note-action-btn.delete {
            color: var(--danger);
        }
        
        .note-action-btn.delete:hover {
            background: rgba(247, 37, 133, 0.1);
        }
        
        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--gray);
            grid-column: 1 / -1;
        }
        
        .empty-state i {
            font-size: 2.5rem;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        }
        
        .modal-content {
            background-color: var(--light);
            border-radius: var(--border-radius);
            width: 90%;
            max-width: 500px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            animation: scaleIn 0.3s ease;
            overflow: hidden;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .modal-header {
            padding: 16px;
            border-bottom: 1px solid var(--gray-light);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .modal-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--dark);
        }
        
        .close-modal {
            background: none;
            border: none;
            font-size: 1.3rem;
            color: var(--gray);
            cursor: pointer;
            transition: var(--transition);
        }
        
        .close-modal:hover {
            color: var(--danger);
        }
        
        .modal-body {
            padding: 16px;
        }
        
        .form-group {
            margin-bottom: 12px;
        }
        
        .form-label {
            display: block;
            margin-bottom: 4px;
            font-weight: 600;
            color: var(--dark);
            font-size: 0.9rem;
        }
        
        .form-input, .form-textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--gray-light);
            border-radius: 6px;
            background-color: var(--light);
            color: var(--dark);
            transition: var(--transition);
            font-size: 0.9rem;
        }
        
        .form-input:focus, .form-textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.2);
        }
        
        .form-textarea {
            min-height: 120px;
            resize: vertical;
            line-height: 1.4;
        }
        
        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 16px;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition);
            font-size: 0.9rem;
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: white;
        }
        
        .btn-primary:hover {
            background-color: var(--secondary);
        }
        
        .btn-secondary {
            background-color: var(--gray-light);
            color: white;
        }
        
        .btn-secondary:hover {
            background-color: var(--gray);
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
    </style>
</head>
<body>
    <div class="header">
        <a href="/tasks" class="header-action-btn">
            <i class="fas fa-tasks"></i>
            <span>Tasks</span>
        </a>
        <a href="/notes" class="header-action-btn active">
            <i class="fas fa-wand-magic-sparkles"></i>
            <span>Notes</span>
        </a>
        <a href="/history" class="header-action-btn">
            <i class="fas fa-history"></i>
            <span>History</span>
        </a>
    </div>

    <button class="fab" onclick="openAddNoteModal()" title="Add Note">
        <i class="fas fa-plus"></i>
    </button>

    <div class="main-content">
        <div class="info-message">
            <i class="fas fa-globe"></i> <strong>Global Mode</strong> - Everyone sees the same notes
        </div>
        
        <div class="content-header">
            <h1 class="page-title">Global Notes</h1>
        </div>

        <div class="notes-container">
            <% if (notes.length === 0) { %>
                <div class="empty-state">
                    <i class="fas fa-wand-magic-sparkles"></i>
                    <p>No notes yet. Click the + button to add your first global note!</p>
                </div>
            <% } else { %>
                <% notes.forEach(function(note) { %>
                    <div class="note-card">
                        <details class="note-details" <%= notes.indexOf(note) === 0 ? 'open' : '' %>>
                            <summary class="note-summary">
                                <div class="note-header">
                                    <h3 class="note-title"><%= note.title %></h3>
                                    <div class="note-date">
                                        <i class="fas fa-clock"></i>
                                        <%= note.updatedAtUTC || note.createdAtUTC %> UTC
                                    </div>
                                </div>
                            </summary>
                            <div class="note-content">
                                <% if (note.description) { %>
                                    <div class="note-description"><%- note.description.replace(/\\n/g, '<br>') %></div>
                                <% } else { %>
                                    <div class="note-description" style="color: var(--gray); font-style: italic;">Empty note</div>
                                <% } %>
                                <div class="note-footer">
                                    <div class="note-meta">
                                        <span class="note-date-badge">
                                            <i class="fas fa-calendar"></i>
                                            Created: <%= note.createdAtUTC %> UTC
                                        </span>
                                    </div>
                                    <div class="note-actions">
                                        <form method="POST" action="/api/notes/<%= note.noteId %>/move" style="display:inline;">
                                            <input type="hidden" name="direction" value="up">
                                            <button type="submit" class="note-move-btn" title="Move Up">
                                                <i class="fas fa-arrow-up"></i>
                                            </button>
                                        </form>
                                        <form method="POST" action="/api/notes/<%= note.noteId %>/move" style="display:inline;">
                                            <input type="hidden" name="direction" value="down">
                                            <button type="submit" class="note-move-btn" title="Move Down">
                                                <i class="fas fa-arrow-down"></i>
                                            </button>
                                        </form>
                                        <button class="note-action-btn" onclick='openEditNoteModal("<%= note.noteId %>", <%= JSON.stringify(note.title) %>, <%= JSON.stringify(note.description || "") %>)' title="Edit Note">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <form method="POST" action="/api/notes/<%= note.noteId %>/delete" style="display:inline;" onsubmit="return confirm('Delete this global note? Everyone will lose it!')">
                                            <button type="submit" class="note-action-btn delete" title="Delete Note">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                <% }); %>
            <% } %>
        </div>
    </div>

    <!-- Add Note Modal - BOT STYLE -->
    <div class="modal" id="addNoteModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Add New Global Note</h2>
                <button type="button" class="close-modal" onclick="closeAddNoteModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form method="POST" action="/api/notes">
                    <div class="form-group">
                        <label class="form-label">Title * (Max 200 chars)</label>
                        <input type="text" class="form-input" name="title" required placeholder="Enter note title" maxlength="200">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Content (Max 400 words)</label>
                        <textarea class="form-textarea" name="description" placeholder="Enter note content, or '-' for none"></textarea>
                        <small style="color: var(--gray); font-size: 0.75rem;">Enter '-' if no content</small>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeAddNoteModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Note</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Edit Note Modal -->
    <div class="modal" id="editNoteModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Edit Global Note</h2>
                <button type="button" class="close-modal" onclick="closeEditNoteModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form method="POST" action="" id="editNoteForm">
                    <div class="form-group">
                        <label class="form-label">Title * (Max 200 chars)</label>
                        <input type="text" class="form-input" name="title" id="editNoteTitle" required maxlength="200">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Content (Max 400 words)</label>
                        <textarea class="form-textarea" name="description" id="editNoteDescription" placeholder="Enter '-' for empty"></textarea>
                        <small style="color: var(--gray); font-size: 0.75rem;">Enter '-' if no content</small>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeEditNoteModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Note</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script>
        function openAddNoteModal() {
            document.getElementById('addNoteModal').style.display = 'flex';
        }

        function closeAddNoteModal() {
            document.getElementById('addNoteModal').style.display = 'none';
            document.getElementById('addNoteModal').querySelector('form').reset();
        }

        function openEditNoteModal(noteId, title, description) {
            document.getElementById('editNoteForm').action = \`/api/notes/\${noteId}/update\`;
            document.getElementById('editNoteTitle').value = title;
            document.getElementById('editNoteDescription').value = description;
            document.getElementById('editNoteModal').style.display = 'flex';
        }

        function closeEditNoteModal() {
            document.getElementById('editNoteModal').style.display = 'none';
            document.getElementById('editNoteForm').reset();
        }

        window.addEventListener('click', function(event) {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                    if (modal.id === 'addNoteModal') {
                        modal.querySelector('form').reset();
                    }
                    if (modal.id === 'editNoteModal') {
                        modal.querySelector('form').reset();
                    }
                }
            });
        });
    </script>
</body>
</html>`;
        fs.writeFileSync(path.join(viewsDir, 'notes.ejs'), notesEJS);
        
        // History.ejs
        const historyEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Global Task Manager - History</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary: #4361ee;
            --primary-light: #4895ef;
            --secondary: #3f37c9;
            --success: #4cc9f0;
            --danger: #f72585;
            --warning: #f8961e;
            --info: #4895ef;
            --light: #f8f9fa;
            --dark: #212529;
            --gray: #6c757d;
            --gray-light: #adb5bd;
            --border-radius: 12px;
            --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            --transition: all 0.3s ease;
            --blue-bg: rgba(173, 216, 230, 0.15);
            --blue-bg-hover: rgba(173, 216, 230, 0.25);
        }
        
        @media (prefers-color-scheme: dark) {
            :root {
                --primary: #5a6ff0;
                --primary-light: #6a80f2;
                --secondary: #4f46e5;
                --success: #5fd3f0;
                --danger: #ff2d8e;
                --warning: #ffa94d;
                --info: #6a80f2;
                --light: #121212;
                --dark: #ffffff;
                --gray: #94a3b8;
                --gray-light: #475569;
                --shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                --blue-bg: rgba(173, 216, 230, 0.08);
                --blue-bg-hover: rgba(173, 216, 230, 0.15);
            }
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background-color: var(--light);
            color: var(--dark);
            transition: var(--transition);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 14px;
        }
        
        .header {
            background-color: var(--light);
            padding: 8px 16px;
            display: flex;
            align-items: center;
            justify-content: space-around;
            box-shadow: var(--shadow);
            position: sticky;
            top: 0;
            z-index: 100;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .header-action-btn {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            cursor: pointer;
            transition: var(--transition);
            box-shadow: var(--shadow);
            gap: 8px;
            flex: 1;
            max-width: 120px;
            margin: 0 4px;
            text-decoration: none;
        }
        
        .header-action-btn i {
            font-size: 1rem;
        }
        
        .header-action-btn span {
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        .header-action-btn:hover {
            background: var(--primary-light);
            transform: translateY(-2px);
        }
        
        .header-action-btn.active {
            background: var(--secondary);
            box-shadow: 0 0 0 2px var(--primary-light);
        }
        
        @media (max-width: 768px) {
            .header {
                padding: 8px;
                gap: 4px;
            }
            .header-action-btn {
                width: 100%;
                max-width: none;
                padding: 10px;
                margin: 2px;
                border-radius: 12px;
            }
            .header-action-btn span {
                display: block;
                font-size: 0.75rem;
            }
            .header-action-btn i {
                margin-right: 4px;
                font-size: 0.9rem;
            }
        }
        
        .main-content {
            flex-grow: 1;
            padding: 16px;
            overflow-y: auto;
            padding-bottom: 100px;
        }
        
        .content-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        
        .page-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--dark);
        }
        
        .global-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        
        .info-message {
            background-color: rgba(67, 97, 238, 0.1);
            border-left: 4px solid var(--primary);
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 6px;
            font-size: 0.85rem;
        }
        
        .history-date-group {
            margin-bottom: 15px;
        }
        
        .history-date-details {
            border-radius: var(--border-radius);
        }
        
        .history-date-summary {
            padding: 12px 16px;
            background-color: var(--blue-bg);
            border-radius: var(--border-radius);
            cursor: pointer;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: var(--transition);
            border: 1px solid transparent;
            list-style: none;
        }
        
        .history-date-summary:hover {
            background-color: var(--blue-bg-hover);
            border-color: var(--primary-light);
        }
        
        .history-date-summary::-webkit-details-marker {
            display: none;
        }
        
        .history-date-content {
            padding: 15px 0 0 0;
        }
        
        .history-items-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 10px 0;
        }
        
        @media (max-width: 1200px) {
            .history-items-container {
                grid-template-columns: repeat(2, 1fr) !important;
            }
        }
        
        @media (max-width: 768px) {
            .history-items-container {
                grid-template-columns: 1fr !important;
            }
        }
        
        .history-card {
            background-color: var(--blue-bg);
            border-radius: var(--border-radius);
            padding: 16px;
            box-shadow: var(--shadow);
            transition: var(--transition);
            border: 1px solid rgba(0,0,0,0.05);
            border-left: 4px solid var(--success);
        }
        
        .history-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        }
        
        .history-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }
        
        .history-card-title {
            font-weight: 600;
            color: var(--dark);
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }
        
        .history-card-title i {
            color: var(--primary);
            font-size: 0.9rem;
        }
        
        .history-card-time {
            font-size: 0.75rem;
            color: var(--gray);
            background: rgba(0,0,0,0.05);
            padding: 3px 8px;
            border-radius: 12px;
            white-space: nowrap;
            margin-left: 10px;
        }
        
        .utc-badge {
            background-color: rgba(67, 97, 238, 0.1);
            color: var(--primary);
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 0.6rem;
            font-weight: 600;
            margin-left: 4px;
        }
        
        @media (prefers-color-scheme: dark) {
            .history-card-time {
                background: rgba(255,255,255,0.1);
            }
        }
        
        .history-card-description {
            font-size: 0.8rem;
            color: var(--gray);
            margin-bottom: 12px;
            line-height: 1.4;
        }
        
        .history-card-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
        }
        
        .history-meta-item {
            background: rgba(0,0,0,0.05);
            color: var(--gray);
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
        }
        
        @media (prefers-color-scheme: dark) {
            .history-meta-item {
                background: rgba(255,255,255,0.1);
            }
        }
        
        .history-subitems {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(0,0,0,0.1);
        }
        
        @media (prefers-color-scheme: dark) {
            .history-subitems {
                border-top-color: rgba(255,255,255,0.1);
            }
        }
        
        .history-stage-item {
            font-size: 0.8rem;
            color: var(--gray);
            margin-bottom: 8px;
            padding: 8px;
            background: rgba(0,0,0,0.03);
            border-radius: 6px;
        }
        
        @media (prefers-color-scheme: dark) {
            .history-stage-item {
                background: rgba(255,255,255,0.05);
            }
        }
        
        .history-stage-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        
        .history-stage-title {
            font-weight: 600;
            color: var(--dark);
            flex: 1;
            font-size: 0.85rem;
        }
        
        .history-stage-description {
            font-size: 0.75rem;
            color: var(--gray);
            margin-top: 4px;
            padding-left: 8px;
            border-left: 2px solid var(--success);
            line-height: 1.4;
        }
        
        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--gray);
        }
        
        .empty-state i {
            font-size: 2.5rem;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="header">
        <a href="/tasks" class="header-action-btn">
            <i class="fas fa-tasks"></i>
            <span>Tasks</span>
        </a>
        <a href="/notes" class="header-action-btn">
            <i class="fas fa-wand-magic-sparkles"></i>
            <span>Notes</span>
        </a>
        <a href="/history" class="header-action-btn active">
            <i class="fas fa-history"></i>
            <span>History</span>
        </a>
    </div>

    <div class="main-content">
        <div class="info-message">
            <i class="fas fa-globe"></i> <strong>Global Mode</strong> - Everyone sees the same history
        </div>
        
        <div class="content-header">
            <h1 class="page-title">Global Task History</h1>
        </div>

        <% if (Object.keys(groupedHistory).length === 0) { %>
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No completed tasks yet. Complete some global tasks to see them here!</p>
            </div>
        <% } else { %>
            <% 
                const sortedDates = Object.keys(groupedHistory).sort().reverse(); 
            %>
            <% sortedDates.forEach(function(date, index) { %>
                <div class="history-date-group">
                    <details class="history-date-details" <%= index === 0 ? 'open' : '' %>>
                        <summary class="history-date-summary">
                            <i class="fas fa-calendar"></i>
                            <%= date %> UTC
                            <span style="margin-left: auto; font-size: 0.8rem; color: var(--gray);">
                                <%= groupedHistory[date].length %> global task<%= groupedHistory[date].length !== 1 ? 's' : '' %>
                            </span>
                        </summary>
                        <div class="history-date-content">
                            <div class="history-items-container">
                                <% groupedHistory[date].forEach(function(task) { %>
                                    <div class="history-card">
                                        <div class="history-card-header">
                                            <div class="history-card-title">
                                                <i class="fas fa-check-circle"></i>
                                                <%= task.title %>
                                            </div>
                                            <div class="history-card-time">
                                                <i class="fas fa-clock"></i> <%= task.completedTimeUTC %> UTC
                                            </div>
                                        </div>
                                        
                                        <% if (task.description) { %>
                                            <div class="history-card-description"><%= task.description %></div>
                                        <% } %>
                                        
                                        <div class="history-card-meta">
                                            <% if (task.repeat && task.repeat !== 'none') { %>
                                                <span class="history-meta-item">
                                                    <i class="fas fa-repeat"></i> <%= task.repeat === 'daily' ? 'Daily' : 'Weekly' %>
                                                    <% if (task.repeatCount) { %>(<%= task.repeatCount %>)<% } %>
                                                </span>
                                            <% } %>
                                            <span class="history-meta-item">
                                                <i class="fas fa-hourglass-half"></i> 
                                                <%= task.durationFormatted || (task.endDate && task.startDate ? Math.round((new Date(task.endDate) - new Date(task.startDate)) / 60000) + ' min' : '30 min') %>
                                            </span>
                                            <% if (task.autoCompleted) { %>
                                                <span class="history-meta-item">
                                                    <i class="fas fa-robot"></i> Auto
                                                </span>
                                            <% } %>
                                            <span class="history-meta-item">
                                                <i class="fas fa-globe"></i> Global
                                            </span>
                                        </div>
                                        
                                        <% if (task.subtasks && task.subtasks.length > 0) { %>
                                            <div class="history-subitems">
                                                <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 8px; color: var(--dark);">
                                                    <i class="fas fa-tasks"></i> Subtasks (<%= task.subtasks.filter(s => s.completed).length %>/<%= task.subtasks.length %>)
                                                </div>
                                                <% task.subtasks.forEach(function(subtask) { %>
                                                    <div class="history-stage-item">
                                                        <div class="history-stage-header">
                                                            <span style="<%= subtask.completed ? 'color: var(--success);' : 'color: var(--gray);' %>">
                                                                <%= subtask.completed ? '✅' : '⭕' %>
                                                            </span>
                                                            <span class="history-stage-title <%= subtask.completed ? '' : '' %>">
                                                                <%= subtask.title %>
                                                            </span>
                                                        </div>
                                                        <% if (subtask.description) { %>
                                                            <div class="history-stage-description"><%= subtask.description %></div>
                                                        <% } %>
                                                    </div>
                                                <% }); %>
                                            </div>
                                        <% } %>
                                    </div>
                                <% }); %>
                            </div>
                        </div>
                    </details>
                </div>
            <% }); %>
        <% } %>
    </div>
</body>
</html>`;
        fs.writeFileSync(path.join(viewsDir, 'history.ejs'), historyEJS);
        
        console.log('✅ EJS template files created successfully');
    } catch (error) {
        console.error('❌ Error writing EJS files:', error.message);
    }
}

// Write EJS files on startup
writeEJSFiles();

// ==========================================
// 🗄️ DATABASE CONNECTION - GLOBAL NO USER ID
// ==========================================
let db;
let client;

async function connectDB() {
    let retries = 5;
    while (retries > 0) {
        try {
            client = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 15000,
                socketTimeoutMS: 45000,
                maxPoolSize: 50,
                minPoolSize: 5
            });
            
            await client.connect();
            db = client.db('telegram_bot');
            console.log('✅ Connected to MongoDB - Global Mode');
            
            // Create indexes for global access
            try {
                await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });
                await db.collection('tasks').createIndex({ nextOccurrence: 1 });
                await db.collection('tasks').createIndex({ orderIndex: 1 });
                await db.collection('history').createIndex({ completedAt: -1 });
                await db.collection('history').createIndex({ originalTaskId: 1 });
                await db.collection('history').createIndex({ completedDate: -1 });
                await db.collection('notes').createIndex({ noteId: 1 }, { unique: true });
                await db.collection('notes').createIndex({ orderIndex: 1 });
                console.log('✅ Indexes created');
            } catch (indexError) {
                console.warn('⚠️ Index creation warning:', indexError.message);
            }
            
            return true;
        } catch (error) {
            retries--;
            console.error(`❌ MongoDB Connection Error (${retries} retries left):`, error.message);
            if (retries === 0) {
                console.error('❌ Failed to connect to MongoDB after multiple attempts');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

// ✅ ADDED: Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        time: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==========================================
// 🛠️ UTC UTILITY FUNCTIONS - NO TIMEZONE
// ==========================================

function generateId(prefix = '', length = 8) {
    return prefix + Math.random().toString(36).substring(2, 2 + length) + '_' + Date.now();
}

async function safeEdit(ctx, text, keyboard = null) {
    try {
        const options = { 
            parse_mode: 'HTML',
            ...(keyboard && { reply_markup: keyboard.reply_markup })
        };
        await ctx.editMessageText(text, options);
    } catch (err) {
        if (err.description && (
            err.description.includes("message is not modified") || 
            err.description.includes("message can't be edited")
        )) {
            try {
                const options = { 
                    parse_mode: 'HTML',
                    ...(keyboard && { reply_markup: keyboard.reply_markup })
                };
                await ctx.reply(text, options);
            } catch (e) { 
                console.error('SafeEdit Reply Error:', e.message);
            }
            return;
        }
        console.error('SafeEdit Error:', err.message);
    }
}

function formatBlockquote(text) {
    if (!text || text.trim() === '') return '';
    return `<blockquote>${text}</blockquote>`;
}

function calculateSubtaskProgress(subtasks) {
    if (!subtasks || subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
}

function calculateDuration(startDate, endDate) {
    return Math.round((endDate - startDate) / 60000);
}

function formatDuration(minutes) {
    if (minutes < 0) return '0 mins';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
    if (mins === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
}

function formatDateUTC(utcDate) {
    return utcDate.toISOString().split('T')[0].split('-').reverse().join('-');
}

function formatTimeUTC(utcDate) {
    return utcDate.toISOString().split('T')[1].substring(0, 5);
}

function formatDateTimeUTC(utcDate) {
    return `${formatDateUTC(utcDate)} at ${formatTimeUTC(utcDate)} UTC`;
}

function getTodayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getTomorrowUTC() {
    const today = getTodayUTC();
    return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

// ==========================================
// ⏰ SCHEDULER LOGIC
// ==========================================

function scheduleTask(task) {
    if (!task || !task.taskId || !task.startDate) return;
    
    try {
        const taskId = task.taskId;
        const startTime = new Date(task.startDate);
        const now = new Date();

        cancelTaskSchedule(taskId);

        if (startTime <= now) {
            console.log(`⏰ Skipping task ${task.title} - start time has passed`);
            return;
        }

        const notifyTime = new Date(startTime.getTime() - 10 * 60000);
        const triggerDate = notifyTime > now ? notifyTime : now;

        console.log(`⏰ Scheduled: ${task.title} for ${formatDateTimeUTC(startTime)}`);

        const startJob = schedule.scheduleJob(triggerDate, async function() {
            if (isShuttingDown) return;
            
            console.log(`🔔 Starting notifications for task: ${task.title}`);
            
            let count = 0;
            const maxNotifications = 10;
            
            const sendNotification = async () => {
                if (isShuttingDown) return;
                
                const currentTime = new Date();
                
                if (currentTime >= startTime || count >= maxNotifications) {
                    const activeSchedule = activeSchedules.get(taskId);
                    if (activeSchedule && activeSchedule.interval) {
                        clearInterval(activeSchedule.interval);
                        activeSchedule.interval = null;
                    }
                    
                    if (currentTime >= startTime) {
                        try {
                            await bot.telegram.sendMessage(CHAT_ID, 
                                `🚀 <b>𝙏𝘼𝙎𝙆 𝙎𝙏𝘼𝙍𝙏𝙀𝘿 𝙉𝙊𝙒!</b>\n` +
                                `📌 <b>Title: ${task.title}</b>\n\n` +
                                `Time to work! ⏰`, 
                                { parse_mode: 'HTML' }
                            );
                        } catch (e) {
                            console.error('Error sending start message:', e.message);
                        }
                    }
                    
                    return;
                }

                const minutesLeft = Math.ceil((startTime - currentTime) / 60000);
                if (minutesLeft <= 0) return;

                try {
                    await bot.telegram.sendMessage(CHAT_ID, 
                        `🔔 <b>𝗥𝗘𝗠𝗜𝗡𝗗𝗘𝗥 (${count + 1}/${maxNotifications})</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📌 <b>${task.title}</b>\n` +
                        `⏳ Starts in: <b>${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}</b>\n` +
                        `⏰ Start Time: ${formatTimeUTC(startTime)} UTC\n` +
                        `📅 Date: ${formatDateUTC(startTime)}\n` +
                        `━━━━━━━━━━━━━━━━━━━━`, 
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {
                    console.error('Error sending notification:', e.message);
                }
                
                count++;
            };

            await sendNotification();
            
            const interval = setInterval(sendNotification, 60000);
            
            if (activeSchedules.has(taskId)) {
                if (activeSchedules.get(taskId).interval) {
                    clearInterval(activeSchedules.get(taskId).interval);
                }
                activeSchedules.get(taskId).interval = interval;
            } else {
                activeSchedules.set(taskId, { startJob, interval });
            }
        });

        if (activeSchedules.has(taskId)) {
            if (activeSchedules.get(taskId).startJob) {
                activeSchedules.get(taskId).startJob.cancel();
            }
            activeSchedules.get(taskId).startJob = startJob;
        } else {
            activeSchedules.set(taskId, { startJob });
        }

    } catch (error) {
        console.error(`❌ Scheduler Error for task ${task?.taskId}:`, error.message);
    }
}

function cancelTaskSchedule(taskId) {
    if (activeSchedules.has(taskId)) {
        const s = activeSchedules.get(taskId);
        if (s.startJob) {
            try { s.startJob.cancel(); } catch (e) {}
        }
        if (s.interval) {
            try { clearInterval(s.interval); } catch (e) {}
        }
        activeSchedules.delete(taskId);
        console.log(`🗑️ Cleared schedules for task ${taskId}`);
    }
}

async function rescheduleAllPending() {
    try {
        const tasks = await db.collection('tasks').find({ 
            status: 'pending',
            startDate: { $gt: new Date() }
        }).toArray();
        
        console.log(`🔄 Rescheduling ${tasks.length} pending tasks...`);
        tasks.forEach(task => scheduleTask(task));
        console.log(`✅ Rescheduled ${tasks.length} tasks.`);
    } catch (error) {
        console.error('❌ Error rescheduling tasks:', error.message);
    }
}

// ==========================================
// ⏰ AUTO-COMPLETE PENDING TASKS AT 23:59 UTC
// ==========================================

async function autoCompletePendingTasks() {
    console.log(`⏰ Running auto-complete for pending tasks at 23:59 UTC...`);
    
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const pendingTasks = await db.collection('tasks').find({
            status: 'pending',
            nextOccurrence: {
                $gte: todayUTC,
                $lt: tomorrowUTC
            }
        }).toArray();
        
        console.log(`📋 Found ${pendingTasks.length} pending tasks to auto-complete`);
        
        for (const task of pendingTasks) {
            await autoCompleteTask(task);
        }
        
        console.log(`✅ Auto-completed ${pendingTasks.length} tasks`);
    } catch (error) {
        console.error('❌ Error in auto-complete:', error.message);
    }
}

async function autoCompleteTask(task) {
    try {
        const taskId = task.taskId;
        const completedAtUTC = new Date();
        const completedDateUTC = getTodayUTC();
        
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtUTC,
            completedDate: completedDateUTC,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            autoCompleted: true
        };
        
        delete historyItem._id;
        
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrence,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime()))
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            if (updatedTask && updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
            }
        } else {
            await db.collection('tasks').deleteOne({ taskId });
        }
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `⏰ <b>𝗔𝗨𝗧𝗢-𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${task.title}</b>\n` +
                `✅ Automatically completed at 23:59 UTC\n` +
                `📅 ${formatDateUTC(completedAtUTC)}\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.error('Error sending auto-complete notification:', e.message);
        }
        
    } catch (error) {
        console.error(`Error auto-completing task ${task.taskId}:`, error.message);
    }
}

function scheduleAutoComplete() {
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
    }
    
    autoCompleteJob = schedule.scheduleJob('59 23 * * *', async () => {
        if (!isShuttingDown) await autoCompletePendingTasks();
    });
    
    console.log('✅ Auto-complete scheduler started (23:59 UTC daily)');
}

// ==========================================
// 📱 WEB INTERFACE ROUTES - NO SESSION, GLOBAL DATA
// ==========================================

// ✅ FIXED: Root route with error handling
app.get('/', (req, res) => {
    res.redirect('/tasks');
});

// ✅ FIXED: Tasks route with error handling
app.get('/tasks', async (req, res) => {
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const [tasks, completedTasks] = await Promise.all([
            db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray(),
            
            db.collection('history').find({
                completedAt: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ completedAt: -1 }).toArray()
        ]);
        
        console.log(`📊 Tasks found: ${tasks.length}, Completed: ${completedTasks.length}`);
        
        res.render('tasks', {
            tasks: tasks.map(task => ({
                ...task,
                startTimeUTC: formatTimeUTC(task.startDate),
                endTimeUTC: formatTimeUTC(task.endDate),
                dateUTC: formatDateUTC(task.startDate),
                duration: calculateDuration(task.startDate, task.endDate),
                durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)),
                subtaskProgress: calculateSubtaskProgress(task.subtasks)
            })),
            completedTasks: completedTasks.map(task => ({
                ...task,
                completedTimeUTC: formatTimeUTC(task.completedAt),
                dateUTC: formatDateUTC(task.completedAt)
            })),
            currentTime: formatTimeUTC(new Date()),
            currentDate: formatDateUTC(new Date())
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
        res.status(500).send('Error loading tasks: ' + error.message);
    }
});

// ✅ FIXED: Notes route with error handling
app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        console.log(`📝 Notes found: ${notes.length}`);
        
        res.render('notes', {
            notes: notes.map(note => ({
                ...note,
                createdAtUTC: formatDateTimeUTC(note.createdAt),
                updatedAtUTC: note.updatedAt ? formatDateTimeUTC(note.updatedAt) : null
            }))
        });
    } catch (error) {
        console.error('Error loading notes:', error);
        res.status(500).send('Error loading notes: ' + error.message);
    }
});

// ✅ FIXED: History route with error handling
app.get('/history', async (req, res) => {
    try {
        const history = await db.collection('history').find()
            .sort({ completedAt: -1 })
            .limit(100)
            .toArray();
        
        const groupedHistory = {};
        history.forEach(item => {
            const dateKey = formatDateUTC(item.completedAt);
            if (!groupedHistory[dateKey]) {
                groupedHistory[dateKey] = [];
            }
            groupedHistory[dateKey].push({
                ...item,
                completedTimeUTC: formatTimeUTC(item.completedAt)
            });
        });
        
        console.log(`📜 History entries: ${history.length}`);
        
        res.render('history', { groupedHistory });
    } catch (error) {
        console.error('Error loading history:', error);
        res.status(500).send('Error loading history: ' + error.message);
    }
});

// API Routes
app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, duration, repeat, repeatCount } = req.body;
        
        if (!title || !startDate || !startTime || !duration) {
            return res.status(400).send('Missing required fields');
        }
        
        const [year, month, day] = startDate.split('-').map(Number);
        const [hour, minute] = startTime.split(':').map(Number);
        
        const startDateUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
        const endDateUTC = new Date(startDateUTC.getTime() + (parseInt(duration) * 60 * 1000));
        
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        const task = {
            taskId: generateId('task_'),
            title: title.trim(),
            description: description ? description.trim() : '',
            startDate: startDateUTC,
            endDate: endDateUTC,
            nextOccurrence: startDateUTC,
            status: 'pending',
            repeat: repeat || 'none',
            repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 10) : 0,
            subtasks: [],
            createdAt: new Date(),
            orderIndex: nextOrderIndex,
            startTimeStr: startTime
        };
        
        await db.collection('tasks').insertOne(task);
        console.log(`✅ Task created: ${task.title} (${task.taskId})`);
        
        if (task.startDate > new Date()) {
            scheduleTask(task);
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Error creating task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const subtasks = task.subtasks || [];
        const incompleteSubtasks = subtasks.filter(s => !s.completed);
        
        if (incompleteSubtasks.length > 0) {
            return res.status(400).json({ 
                error: 'Complete all subtasks first',
                incompleteCount: incompleteSubtasks.length 
            });
        }
        
        const completedAtUTC = new Date();
        const completedDateUTC = getTodayUTC();
        
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtUTC,
            completedDate: completedDateUTC,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            subtasks: task.subtasks
        };
        
        delete historyItem._id;
        
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
            
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrence,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime())),
                    subtasks: resetSubtasks
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            if (updatedTask && updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
            }
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `🔄 Next occurrence: ${formatDateUTC(nextOccurrence)}\n` +
                    `📊 Remaining repeats: ${task.repeatCount - 1}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `📅 Completed at: ${formatDateTimeUTC(completedAtUTC)}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).send('Error completing task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        
        cancelTaskSchedule(taskId);
        await db.collection('tasks').deleteOne({ taskId });
        
        console.log(`🗑️ Task deleted: ${taskId}`);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).send('Error deleting task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Subtask title cannot be empty');
        }
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const currentSubtasks = task.subtasks || [];
        if (currentSubtasks.length >= 10) {
            return res.status(400).send('Maximum subtasks limit (10) reached');
        }
        
        const subtask = {
            id: generateId('sub_'),
            title: title.trim(),
            description: description ? description.trim() : '',
            completed: false,
            createdAt: new Date()
        };
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $push: { subtasks: subtask } }
        );
        
        console.log(`➕ Subtask added to ${task.title}: ${subtask.title}`);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error adding subtask:', error);
        res.status(500).send('Error adding subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const subtask = (task.subtasks || []).find(s => s.id === subtaskId);
        if (!subtask) {
            return res.status(404).send('Subtask not found');
        }
        
        await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { $set: { "subtasks.$.completed": !subtask.completed } }
        );
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error toggling subtask:', error);
        res.status(500).send('Error toggling subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $pull: { subtasks: { id: subtaskId } } }
        );
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error deleting subtask:', error);
        res.status(500).send('Error deleting subtask: ' + error.message);
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Note title cannot be empty');
        }
        
        const highestNote = await db.collection('notes').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
        
        const note = {
            noteId: generateId('note_'),
            title: title.trim(),
            description: description ? description.trim() : '',
            createdAt: new Date(),
            updatedAt: new Date(),
            orderIndex: nextOrderIndex
        };
        
        await db.collection('notes').insertOne(note);
        
        console.log(`📝 Note created: ${note.title} (${note.noteId})`);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).send('Error creating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/update', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Note title cannot be empty');
        }
        
        await db.collection('notes').updateOne(
            { noteId },
            { 
                $set: { 
                    title: title.trim(), 
                    description: description ? description.trim() : '',
                    updatedAt: new Date() 
                } 
            }
        );
        
        console.log(`✏️ Note updated: ${noteId}`);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send('Error updating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        
        await db.collection('notes').deleteOne({ noteId });
        
        console.log(`🗑️ Note deleted: ${noteId}`);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).send('Error deleting note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/move', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        const { direction } = req.body;
        
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1 })
            .toArray();
        
        const currentIndex = notes.findIndex(n => n.noteId === noteId);
        if (currentIndex === -1) {
            return res.status(404).send('Note not found');
        }
        
        if (direction === 'up' && currentIndex > 0) {
            const tempOrder = notes[currentIndex].orderIndex;
            notes[currentIndex].orderIndex = notes[currentIndex - 1].orderIndex;
            notes[currentIndex - 1].orderIndex = tempOrder;
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex].noteId },
                { $set: { orderIndex: notes[currentIndex].orderIndex } }
            );
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex - 1].noteId },
                { $set: { orderIndex: notes[currentIndex - 1].orderIndex } }
            );
        } else if (direction === 'down' && currentIndex < notes.length - 1) {
            const tempOrder = notes[currentIndex].orderIndex;
            notes[currentIndex].orderIndex = notes[currentIndex + 1].orderIndex;
            notes[currentIndex + 1].orderIndex = tempOrder;
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex].noteId },
                { $set: { orderIndex: notes[currentIndex].orderIndex } }
            );
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex + 1].noteId },
                { $set: { orderIndex: notes[currentIndex + 1].orderIndex } }
            );
        }
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error moving note:', error);
        res.status(500).send('Error moving note: ' + error.message);
    }
});

// ==========================================
// 🤖 BOT COMMANDS - GLOBAL, ONLY SEND TO YOUR USER ID
// ==========================================

// Telegram Bot
const bot = new Telegraf(BOT_TOKEN);

// Map to store active jobs: key = taskId, value = { startJob, interval }
const activeSchedules = new Map();
let hourlySummaryJob = null;
let autoCompleteJob = null;
let isShuttingDown = false;

bot.use(telegrafSession());

bot.use((ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    return next();
});

// ✅ FIXED: Only respond to your user ID
bot.use((ctx, next) => {
    if (ctx.from && ctx.from.id.toString() === CHAT_ID.toString()) {
        return next();
    }
    // Ignore messages from other users
    return;
});

bot.command('start', async (ctx) => {
    ctx.session = {};
    
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${formatTimeUTC(new Date())} UTC
📅 Today: ${formatDateUTC(new Date())}

🌟 <b>Welcome to Global Task Manager!</b>
🌍 Everyone sees the same tasks and notes
📢 All notifications will be sent to you only`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')],
        [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📜 History', 'view_history_dates_1'),
            Markup.button.callback('🗒️ Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('🔄 Reorder Tasks', 'reorder_tasks_menu'),
            Markup.button.callback('🔄 Reorder Notes', 'reorder_notes_menu')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ],
        [Markup.button.url('🌐 Open Web App', WEB_APP_URL)]
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

bot.action('main_menu', async (ctx) => {
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${formatTimeUTC(new Date())} UTC
📅 Today: ${formatDateUTC(new Date())}

🌟 <b>Select an option:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')],
        [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📜 History', 'view_history_dates_1'),
            Markup.button.callback('🗒️ Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('🔄 Reorder Tasks', 'reorder_tasks_menu'),
            Markup.button.callback('🔄 Reorder Notes', 'reorder_notes_menu')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ],
        [Markup.button.url('🌐 Open Web App', WEB_APP_URL)]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// 📅 TASK VIEWS - WITH PAGINATION
// ==========================================

bot.action(/^view_today_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const todayUTC = getTodayUTC();
    const tomorrowUTC = getTomorrowUTC();
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalTasks = await db.collection('tasks').countDocuments({ 
        status: 'pending',
        nextOccurrence: { 
            $gte: todayUTC,
            $lt: tomorrowUTC
        }
    });
    
    const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));
    
    const tasks = await db.collection('tasks')
        .find({ 
            status: 'pending',
            nextOccurrence: { 
                $gte: todayUTC,
                $lt: tomorrowUTC
            }
        })
        .sort({ orderIndex: 1, nextOccurrence: 1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    let text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDateUTC(todayUTC)}
📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}
📄 Page: ${page}/${totalPages}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDateUTC(todayUTC)}
📭 <i>No tasks scheduled for today!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    
    tasks.forEach((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        if (t.subtasks && t.subtasks.length > 0) {
            const progress = calculateSubtaskProgress(t.subtasks);
            taskTitle += ` [${progress}%]`;
        }
        
        if (taskTitle.length > 30) {
            taskTitle = taskTitle.substring(0, 27) + '...';
        }
        
        buttons.push([
            Markup.button.callback(
                `${taskNum}. ${taskTitle}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Back', `view_today_tasks_${page - 1}`));
        }
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `view_today_tasks_${page + 1}`));
        }
        buttons.push(paginationRow);
    }

    buttons.push([
        Markup.button.callback('➕ Add Task', 'add_task'),
        Markup.button.callback('🔙 Back', 'main_menu')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// ==========================================
// ➕ ADD TASK WIZARD - WITH BOT-STYLE TEXT BOXES
// ==========================================

bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateId('task_'), 
        status: 'pending',
        createdAt: new Date(),
        subtasks: []
    };
    
    const text = `🎯 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task (max 100 characters):`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId('note_'), 
        createdAt: new Date()
    };
    
    const text = `📝 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note (max 200 characters):`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 📨 TEXT INPUT HANDLER - BOT-STYLE VALIDATION
// ==========================================

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    
    try {
        const text = ctx.message.text.trim();
        const step = ctx.session.step;

        if (step === 'task_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            ctx.session.task.title = text;
            ctx.session.step = 'task_desc';
            await ctx.reply(
                `📄 <b>𝗘𝗡𝗧𝗘𝗥 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📝 <i>Describe your task (Max 100 words):</i>\n` +
                `Enter "-" for no description`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_desc') {
            const description = text === '-' ? '' : text;
            if (description.length > 0 && description.split(/\s+/).length > 100) {
                return ctx.reply('❌ Too long! Keep it under 100 words.');
            }
            ctx.session.task.description = description;
            ctx.session.step = 'task_date';
            await ctx.reply(
                `📅 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗔𝗧𝗘</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📆 Today (UTC): ${formatDateUTC(new Date())}\n` +
                `📝 <i>Enter the date (DD-MM-YYYY) in UTC:</i>`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_date') {
            if (!/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(text)) {
                return ctx.reply('❌ Invalid date format. Use DD-MM-YYYY');
            }
            
            const [day, month, year] = text.split('-').map(Number);
            
            const today = getTodayUTC();
            const inputDate = new Date(Date.UTC(year, month - 1, day));
            
            if (inputDate < today) {
                return ctx.reply('❌ Date cannot be in the past. Please select today or a future date.');
            }
            
            ctx.session.task.dateStr = text;
            ctx.session.task.year = year;
            ctx.session.task.month = month;
            ctx.session.task.day = day;
            ctx.session.step = 'task_start';
            
            await ctx.reply(
                `⏰ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🕒 Current UTC Time: ${formatTimeUTC(new Date())}\n` +
                `📝 <i>Enter start time in HH:MM (24-hour UTC):</i>`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_start') {
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
            }
            
            const [h, m] = text.split(':').map(Number);
            const { year, month, day } = ctx.session.task;
            
            const startDateUTC = new Date(Date.UTC(year, month - 1, day, h, m, 0));
            
            const now = new Date();
            
            if (startDateUTC <= now) {
                return ctx.reply('❌ Start time is in the past. Please enter a future time.');
            }
            
            ctx.session.task.startDate = startDateUTC;
            ctx.session.task.startTimeStr = text;
            ctx.session.task.nextOccurrence = startDateUTC;
            ctx.session.step = 'task_duration';
            
            await ctx.reply(
                `⏱️ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⏰ Start Time: ${text} UTC\n` +
                `📝 <i>Enter task duration in minutes (e.g., 15, 30, 60, 90, 120):</i>\n` +
                `📝 <i>Or enter end time in HH:MM format</i>`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_duration') {
            let endDateUTC;
            let endTimeStr;
            
            if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                const [eh, em] = text.split(':').map(Number);
                const { year, month, day } = ctx.session.task;
                endDateUTC = new Date(Date.UTC(year, month - 1, day, eh, em, 0));
                endTimeStr = text;
            } else {
                const duration = parseInt(text);
                if (isNaN(duration) || duration < 1 || duration > 1440) {
                    return ctx.reply('❌ Please enter a valid duration between 1 and 1440 minutes, or end time in HH:MM format.');
                }
                endDateUTC = new Date(ctx.session.task.startDate.getTime() + duration * 60000);
                endTimeStr = endDateUTC.toISOString().split('T')[1].substring(0, 5);
            }
            
            if (endDateUTC <= ctx.session.task.startDate) {
                return ctx.reply('❌ End time must be after Start time.');
            }
            
            ctx.session.task.endDate = endDateUTC;
            ctx.session.task.endTimeStr = endTimeStr;
            ctx.session.step = null;

            const duration = calculateDuration(ctx.session.task.startDate, endDateUTC);
            
            await ctx.reply(
                `🔄 <b>𝗥𝗘𝗣𝗘𝗔𝗧 𝗢𝗣𝗧𝗜𝗢𝗡𝗦</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `How should this task repeat?\n\n` +
                `📅 Task Date: ${formatDateUTC(ctx.session.task.startDate)}\n` +
                `⏰ Time: ${ctx.session.task.startTimeStr} - ${endTimeStr} UTC\n` +
                `⏱️ Duration: ${formatDuration(duration)}\n\n`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ No Repeat', 'repeat_none')],
                        [Markup.button.callback('📅 Daily', 'repeat_daily')],
                        [Markup.button.callback('📅 Weekly', 'repeat_weekly')],
                        [Markup.button.callback('🔙 Cancel', 'main_menu')]
                    ])
                }
            );
        }
        else if (step === 'task_repeat_count') {
            const count = parseInt(text);
            if (isNaN(count) || count < 1 || count > 365) {
                return ctx.reply('❌ Please enter a valid number between 1 and 365.');
            }
            ctx.session.task.repeatCount = count;
            await saveTask(ctx);
        }
        else if (step === 'note_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 200) return ctx.reply('❌ Title too long. Max 200 characters.');
            
            ctx.session.note.title = text;
            ctx.session.step = 'note_content';
            await ctx.reply(
                `📝 <b>𝗘𝗡𝗧𝗘𝗥 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📝 <i>Enter note content (Max 400 words)</i>\n` +
                `Enter "-" for empty content`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'note_content') {
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Keep it under 400 words.');
            }
            
            ctx.session.note.content = content;
            ctx.session.note.createdAt = new Date();
            ctx.session.note.updatedAt = new Date();
            
            try {
                const highestNote = await db.collection('notes').findOne(
                    {},
                    { sort: { orderIndex: -1 } }
                );
                const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
                ctx.session.note.orderIndex = nextOrderIndex;
                
                const noteTitle = ctx.session.note.title;
                const noteContent = ctx.session.note.content;
                
                await db.collection('notes').insertOne(ctx.session.note);
                
                ctx.session.step = null;
                delete ctx.session.note;
                
                await ctx.reply(
                    `✅ <b>𝗡𝗢𝗧𝗘 𝗦𝗔𝗩𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${noteTitle}</b>\n` +
                    `${formatBlockquote(noteContent)}\n` +
                    `📅 Saved on: ${formatDateTimeUTC(new Date())} UTC`,
                    { parse_mode: 'HTML' }
                );
                
                await showMainMenu(ctx);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        `📝 <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗔𝗗𝗗𝗘𝗗</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📌 <b>${noteTitle}</b>\n` +
                        `${formatBlockquote(noteContent)}\n` +
                        `📅 ${formatDateTimeUTC(new Date())} UTC\n` +
                        `━━━━━━━━━━━━━━━━━━━━`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
                
            } catch (error) {
                console.error('Error saving note:', error);
                await ctx.reply('❌ Failed to save note. Please try again.');
            }
        }
        else if (step === 'add_subtasks') {
            const taskId = ctx.session.addSubtasksTaskId;
            
            const task = await db.collection('tasks').findOne({ taskId });
            if (!task) {
                ctx.session.step = null;
                delete ctx.session.addSubtasksTaskId;
                return ctx.reply('❌ Task not found.');
            }
            
            const currentSubtasks = task.subtasks || [];
            const availableSlots = 10 - currentSubtasks.length;
            
            if (availableSlots <= 0) {
                ctx.session.step = null;
                delete ctx.session.addSubtasksTaskId;
                return ctx.reply('❌ Maximum subtasks limit (10) reached for this task.');
            }
            
            const lines = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            if (lines.length === 0) {
                return ctx.reply('❌ Please enter at least one subtask title.');
            }
            
            if (lines.length > availableSlots) {
                return ctx.reply(`❌ You can only add ${availableSlots} more subtask${availableSlots !== 1 ? 's' : ''}. Please enter ${availableSlots} or fewer.`);
            }
            
            const newSubtasks = lines.map(title => ({
                id: generateId('sub_'),
                title: title.substring(0, 100),
                description: '',
                completed: false,
                createdAt: new Date()
            }));
            
            await db.collection('tasks').updateOne(
                { taskId },
                { 
                    $push: { 
                        subtasks: { 
                            $each: newSubtasks 
                        } 
                    } 
                }
            );
            
            ctx.session.step = null;
            delete ctx.session.addSubtasksTaskId;
            
            await ctx.reply(
                `✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦 𝗔𝗗𝗗𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${task.title}</b>\n` +
                `➕ Added ${newSubtasks.length} new subtask${newSubtasks.length !== 1 ? 's' : ''}\n` +
                `📊 Now has ${currentSubtasks.length + newSubtasks.length}/10 subtasks\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
            
            await showTaskDetail(ctx, taskId);
        }
        else if (step === 'edit_subtask_title') {
            const { taskId, subtaskId } = ctx.session.editSubtask;
            
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId, "subtasks.id": subtaskId },
                    { $set: { "subtasks.$.title": text } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editSubtask;
                
                await ctx.reply(`✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error editing subtask:', error);
                await ctx.reply('❌ Failed to update subtask.');
            }
        }
        else if (step === 'edit_task_title') {
            const taskId = ctx.session.editTaskId;
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { $set: { title: text } }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { title: text } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>TITLE UPDATED!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        `✏️ <b>𝗧𝗔𝗦𝗞 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📌 New Title: <b>${text}</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            } catch (error) {
                console.error('Error updating title:', error);
                await ctx.reply('❌ Failed to update title.');
            }
        }
        else if (step === 'edit_task_desc') {
            const taskId = ctx.session.editTaskId;
            const description = text === '-' ? '' : text;
            if (description.length > 0 && description.split(/\s+/).length > 100) {
                return ctx.reply('❌ Too long! Max 100 words.');
            }
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { $set: { description: description } }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { description: description } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>DESCRIPTION UPDATED!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating description:', error);
                await ctx.reply('❌ Failed to update description.');
            }
        }
        else if (step === 'edit_task_start') {
            const taskId = ctx.session.editTaskId;
            
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid Format. Use HH:MM (24-hour)');
            }
            
            try {
                const task = await db.collection('tasks').findOne({ taskId });
                if (!task) {
                    ctx.session.step = null;
                    delete ctx.session.editTaskId;
                    return ctx.reply('❌ Task not found.');
                }
                
                const utcDate = new Date(task.startDate);
                const year = utcDate.getUTCFullYear();
                const month = utcDate.getUTCMonth();
                const day = utcDate.getUTCDate();
                const [h, m] = text.split(':').map(Number);
                
                const newStartDateUTC = new Date(Date.UTC(year, month, day, h, m, 0));
                
                const duration = task.endDate.getTime() - task.startDate.getTime();
                const newEndDateUTC = new Date(newStartDateUTC.getTime() + duration);
                
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { 
                        $set: { 
                            startDate: newStartDateUTC,
                            endDate: newEndDateUTC,
                            nextOccurrence: newStartDateUTC,
                            startTimeStr: text
                        } 
                    }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { 
                        $set: { 
                            startDate: newStartDateUTC,
                            endDate: newEndDateUTC
                        } 
                    }
                );
                
                const updatedTask = await db.collection('tasks').findOne({ taskId });
                if (updatedTask) {
                    cancelTaskSchedule(taskId);
                    if (updatedTask.nextOccurrence > new Date()) {
                        scheduleTask(updatedTask);
                    }
                }
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>START TIME UPDATED!</b>\n\nEnd time adjusted to: ${formatTimeUTC(newEndDateUTC)} UTC`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating start time:', error);
                await ctx.reply('❌ Failed to update start time.');
            }
        }
        else if (step === 'edit_task_duration') {
            const taskId = ctx.session.editTaskId;
            
            try {
                const task = await db.collection('tasks').findOne({ taskId });
                if (!task) {
                    ctx.session.step = null;
                    delete ctx.session.editTaskId;
                    return ctx.reply('❌ Task not found.');
                }
                
                let newEndDateUTC;
                
                if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                    const [eh, em] = text.split(':').map(Number);
                    const utcDate = new Date(task.endDate);
                    const year = utcDate.getUTCFullYear();
                    const month = utcDate.getUTCMonth();
                    const day = utcDate.getUTCDate();
                    
                    newEndDateUTC = new Date(Date.UTC(year, month, day, eh, em, 0));
                    
                    if (newEndDateUTC <= task.startDate) {
                        return ctx.reply('❌ End time must be after start time.');
                    }
                } else {
                    const duration = parseInt(text);
                    if (isNaN(duration) || duration < 1 || duration > 1440) {
                        return ctx.reply('❌ Please enter a valid duration between 1 and 1440 minutes, or end time in HH:MM format.');
                    }
                    newEndDateUTC = new Date(task.startDate.getTime() + duration * 60000);
                }
                
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { $set: { endDate: newEndDateUTC } }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { endDate: newEndDateUTC } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>DURATION UPDATED!</b>\n\nNew end time: ${formatTimeUTC(newEndDateUTC)} UTC`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating duration:', error);
                await ctx.reply('❌ Failed to update duration.');
            }
        }
        else if (step === 'edit_task_repeat_count') {
            const taskId = ctx.session.editTaskId;
            const count = parseInt(text);
            
            if (isNaN(count) || count < 0 || count > 365) {
                return ctx.reply('❌ Invalid Number. Enter 0-365');
            }
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { 
                        $set: { 
                            repeatCount: count,
                            ...(count === 0 && { repeat: 'none' })
                        } 
                    }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { 
                        $set: { 
                            repeatCount: count,
                            ...(count === 0 && { repeat: 'none' })
                        } 
                    }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>REPEAT COUNT UPDATED!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating repeat count:', error);
                await ctx.reply('❌ Failed to update repeat count.');
            }
        }
        else if (step === 'edit_note_title') {
            const noteId = ctx.session.editNoteId;
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 200) return ctx.reply('❌ Title too long. Max 200 characters.');
            
            try {
                await db.collection('notes').updateOne(
                    { noteId: noteId }, 
                    { $set: { title: text, updatedAt: new Date() } }
                );
                
                const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
                
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                
                await ctx.reply(
                    `✅ <b>𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${updatedNote.title}</b>\n` +
                    `${formatBlockquote(updatedNote.content)}\n` +
                    `📅 Updated: ${formatDateTimeUTC(new Date())} UTC`,
                    { parse_mode: 'HTML' }
                );
                
                await showNoteDetail(ctx, noteId);
                
            } catch (error) {
                console.error('Error updating note title:', error);
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                await ctx.reply('❌ Failed to update title.');
            }
        }
        else if (step === 'edit_note_content') {
            const noteId = ctx.session.editNoteId;
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Max 400 words.');
            }
            
            try {
                await db.collection('notes').updateOne(
                    { noteId: noteId }, 
                    { $set: { content: content, updatedAt: new Date() } }
                );
                
                const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
                
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                
                await ctx.reply(
                    `✅ <b>𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${updatedNote.title}</b>\n` +
                    `${formatBlockquote(updatedNote.content)}\n` +
                    `📅 Updated: ${formatDateTimeUTC(new Date())} UTC`,
                    { parse_mode: 'HTML' }
                );
                
                await showNoteDetail(ctx, noteId);
                
            } catch (error) {
                console.error('Error updating note content:', error);
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                await ctx.reply('❌ Failed to update content.');
            }
        }
    } catch (error) {
        console.error('Text handler error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

bot.action('repeat_none', async (ctx) => {
    ctx.session.task.repeat = 'none';
    ctx.session.task.repeatCount = 0;
    await saveTask(ctx);
});

bot.action('repeat_daily', async (ctx) => {
    ctx.session.task.repeat = 'daily';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        `🔢 <b>𝗗𝗔𝗜𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 <i>How many times should this task repeat? (1-365)</i>`,
        { parse_mode: 'HTML' }
    );
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        `🔢 <b>𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 <i>How many times should this task repeat? (1-365)</i>`,
        { parse_mode: 'HTML' }
    );
});

async function saveTask(ctx) {
    const task = ctx.session.task;
    
    try {
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        task.status = 'pending';
        task.createdAt = new Date();
        task.orderIndex = nextOrderIndex;
        task.subtasks = task.subtasks || [];
        if (!task.nextOccurrence) {
            task.nextOccurrence = task.startDate;
        }
        
        await db.collection('tasks').insertOne(task);
        scheduleTask(task);
        
        ctx.session.step = null;
        delete ctx.session.task;
        
        const duration = calculateDuration(task.startDate, task.endDate);
        
        const msg = `
✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗖𝗥𝗘𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${formatBlockquote(task.description)}
📅 <b>Date:</b> ${formatDateUTC(task.startDate)}
⏰ <b>Time:</b> ${task.startTimeStr} - ${task.endTimeStr} UTC
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat:</b> ${task.repeat} (${task.repeatCount || 0} times)
📊 <b>Status:</b> ⏳ Pending

🔔 <i>Notifications will start 10 minutes before the task.</i>
━━━━━━━━━━━━━━━━━━━━`;
                
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1'),
                Markup.button.callback('🔙 Back', 'main_menu')
            ]
        ]);
        
        await safeEdit(ctx, msg, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `✅ <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗔𝗗𝗗𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${task.title}</b>\n` +
                `${formatBlockquote(task.description)}\n` +
                `📅 ${formatDateUTC(task.startDate)}\n` +
                `⏰ ${task.startTimeStr} - ${task.endTimeStr} UTC\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

bot.action(/^task_det_(.+)$/, async (ctx) => {
    await showTaskDetail(ctx, ctx.match[1]);
});

async function showTaskDetail(ctx, taskId) {
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        const text = '❌ <b>𝗧𝗔𝗦𝗞 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis task may have been completed or deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    const subtasks = task.subtasks || [];
    const progress = calculateSubtaskProgress(subtasks);
    const completedSubtasks = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    const duration = calculateDuration(task.startDate, task.endDate);
    
    let text = `
📌 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>Task ID:</b> <code>${task.taskId}</code>
📛 <b>Title:</b> ${task.title}
${formatBlockquote(task.description)}
📅 <b>Next Occurrence:</b> ${formatDateTimeUTC(task.nextOccurrence)}
⏰ <b>Time:</b> ${formatTimeUTC(task.startDate)} - ${formatTimeUTC(task.endDate)} UTC
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat} 
🔢 <b>Remaining Repeats:</b> ${task.repeatCount || 0}
🏷️ <b>Priority Order:</b> ${task.orderIndex + 1}
📊 <b>Status:</b> ${task.status === 'pending' ? '⏳ Pending' : '✅ Completed'}
`;

    if (totalSubtasks > 0) {
        const barLength = 10;
        const filledBars = Math.round((progress / 100) * barLength);
        const emptyBars = barLength - filledBars;
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        text += `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b> ${completedSubtasks}/${totalSubtasks}
${progressBar} ${progress}%
━━━━━━━━━━━━━━━━━━━━
`;
    } else {
        text += `\n📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b> No subtasks yet\n━━━━━━━━━━━━━━━━━━━━\n`;
    }

    const buttons = [];
    
    subtasks.forEach((subtask, index) => {
        const status = subtask.completed ? '✅' : '⭕';
        let title = subtask.title;
        if (title.length > 30) title = title.substring(0, 27) + '...';
        
        const buttonRow = [
            Markup.button.callback(
                `${status} ${index + 1}. ${title}`, 
                `subtask_det_${taskId}_${subtask.id}`
            )
        ];
        buttons.push(buttonRow);
    });
    
    const actionRow = [];
    
    if (totalSubtasks < 10) {
        actionRow.push(Markup.button.callback('➕', `add_subtask_${taskId}`));
    }
    
    actionRow.push(Markup.button.callback('✏️', `edit_menu_${taskId}`));
    actionRow.push(Markup.button.callback('🗑️', `delete_task_${taskId}`));
    actionRow.push(Markup.button.callback('✅', `complete_${taskId}`));
    
    buttons.push(actionRow);
    
    buttons.push([
        Markup.button.callback('📋 Tasks', 'view_today_tasks_1'),
        Markup.button.callback('🔙 Back', 'view_today_tasks_1')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

bot.action(/^subtask_det_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }
    
    const subtask = (task.subtasks || []).find(s => s.id === subtaskId);
    if (!subtask) {
        await ctx.answerCbQuery('❌ Subtask not found');
        return;
    }
    
    const status = subtask.completed ? '✅ Completed' : '⭕ Pending';
    const text = `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>Task:</b> ${task.title}
🔖 <b>Subtask:</b> ${subtask.title}
📊 <b>Status:</b> ${status}
🆔 <b>ID:</b> <code>${subtask.id}</code>
📅 <b>Created:</b> ${formatDateTimeUTC(subtask.createdAt)} UTC
━━━━━━━━━━━━━━━━━━━━`;

    const buttons = [];
    
    if (!subtask.completed) {
        buttons.push([
            Markup.button.callback('✅', `subtask_complete_${taskId}_${subtaskId}`),
            Markup.button.callback('✏️', `subtask_edit_${taskId}_${subtaskId}`),
            Markup.button.callback('🗑️', `subtask_delete_${taskId}_${subtaskId}`)
        ]);
    } else {
        buttons.push([
            Markup.button.callback('✏️', `subtask_edit_${taskId}_${subtaskId}`),
            Markup.button.callback('🗑️', `subtask_delete_${taskId}_${subtaskId}`)
        ]);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Task', `task_det_${taskId}`)]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^subtask_complete_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { $set: { "subtasks.$.completed": true } }
        );
        
        await ctx.answerCbQuery('✅ Subtask completed!');
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error completing subtask:', error);
        await ctx.answerCbQuery('❌ Error completing subtask');
    }
});

bot.action(/^subtask_edit_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    ctx.session.step = 'edit_subtask_title';
    ctx.session.editSubtask = { taskId, subtaskId };
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗧𝗜𝗧𝗟𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title for the subtask:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^subtask_delete_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        await db.collection('tasks').updateOne(
            { taskId },
            { $pull: { subtasks: { id: subtaskId } } }
        );
        
        await ctx.answerCbQuery('🗑️ Subtask deleted');
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error deleting subtask:', error);
        await ctx.answerCbQuery('❌ Error deleting subtask');
    }
});

bot.action(/^add_subtask_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }
    
    const currentSubtasks = task.subtasks || [];
    const availableSlots = 10 - currentSubtasks.length;
    
    if (availableSlots <= 0) {
        await ctx.answerCbQuery('❌ Maximum subtasks limit (10) reached');
        return;
    }
    
    ctx.session.step = 'add_subtasks';
    ctx.session.addSubtasksTaskId = taskId;
    
    await ctx.reply(
        `➕ <b>𝗔𝗗𝗗 𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 <b>${task.title}</b>\n` +
        `📊 Current: ${currentSubtasks.length}/10 subtasks\n` +
        `➕ Available: ${availableSlots} more\n\n` +
        `<i>Enter subtask titles (one per line):</i>\n`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
        }
    );
});

bot.action(/^complete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');

    const subtasks = task.subtasks || [];
    const incompleteSubtasks = subtasks.filter(s => !s.completed);
    
    if (incompleteSubtasks.length > 0) {
        return ctx.answerCbQuery(`❌ Complete all ${incompleteSubtasks.length} pending subtasks first!`);
    }

    const completedAtUTC = new Date();
    const completedDateUTC = getTodayUTC();
    
    const historyItem = {
        ...task,
        _id: undefined,
        completedAt: completedAtUTC,
        completedDate: completedDateUTC,
        originalTaskId: task.taskId,
        status: 'completed',
        completedFromDate: task.nextOccurrence,
        subtasks: task.subtasks
    };
    
    delete historyItem._id;
    
    try {
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);

        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
            
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrence,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime())),
                    subtasks: resetSubtasks
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            
            if (updatedTask && updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
                await ctx.answerCbQuery('✅ Completed! Next occurrence scheduled.');
            } else {
                await ctx.answerCbQuery('✅ Completed! No future occurrences.');
            }
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `🔄 Next: ${formatDateUTC(nextOccurrence)}\n` +
                    `📊 Remaining: ${task.repeatCount - 1}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            await ctx.answerCbQuery('✅ Task Completed & Moved to History!');
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `📅 Completed at: ${formatDateTimeUTC(completedAtUTC)} UTC\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error completing task:', error);
        await ctx.answerCbQuery('❌ Error completing task');
    }
});

bot.action(/^edit_menu_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = `✏️ <b>𝗘𝗗𝗜𝗧 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to edit:`;
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🏷 Title', `edit_task_title_${taskId}`), 
            Markup.button.callback('📝 Description', `edit_task_desc_${taskId}`)
        ],
        [
            Markup.button.callback('⏰ Start Time', `edit_task_start_${taskId}`), 
            Markup.button.callback('⏱️ Duration', `edit_task_duration_${taskId}`)
        ],
        [
            Markup.button.callback('🔄 Repeat', `edit_rep_${taskId}`), 
            Markup.button.callback('🔢 Count', `edit_task_count_${taskId}`)
        ],
        [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^edit_task_title_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_title';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗧𝗜𝗧𝗟𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_desc_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_desc';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new description (Max 100 words, enter "-" for empty):`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_start_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_start';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new start time (HH:MM, 24-hour UTC):\n` +
        `📝 Current duration: ${formatDuration(calculateDuration(task.startDate, task.endDate))}\n` +
        `⚠️ Duration will be preserved`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_duration_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_duration';
    
    const currentDuration = calculateDuration(task.startDate, task.endDate);
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Current duration: ${formatDuration(currentDuration)}\n\n` +
        `Enter new duration in minutes (e.g., 15, 30, 60, 90, 120):\n` +
        `Or enter end time in HH:MM format:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_count_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_repeat_count';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗥𝗘𝗣𝗘𝗔𝗧 𝗖𝗢𝗨𝗡𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new repeat count (0-365):\n` +
        `📝 Current count: ${task.repeatCount || 0}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_rep_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = `🔄 <b>𝗖𝗛𝗔𝗡𝗚𝗘 𝗥𝗘𝗣𝗘𝗔𝗧 𝗠𝗢𝗗𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect new repeat mode:`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ No Repeat', `set_rep_${taskId}_none`)],
        [Markup.button.callback('📅 Daily', `set_rep_${taskId}_daily`)],
        [Markup.button.callback('📅 Weekly', `set_rep_${taskId}_weekly`)],
        [Markup.button.callback('🔙 Back', `edit_menu_${taskId}`)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^set_rep_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const mode = ctx.match[2];
    
    try {
        const updates = { repeat: mode };
        if (mode === 'none') {
            updates.repeatCount = 0;
        } else {
            const task = await db.collection('tasks').findOne({ taskId });
            updates.repeatCount = task?.repeatCount || 10;
        }
        
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        await db.collection('history').updateMany(
            { originalTaskId: taskId }, 
            { $set: updates }
        );
        
        await ctx.answerCbQuery(`✅ Updated to ${mode}`);
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error updating repeat mode:', error);
        await ctx.answerCbQuery('❌ Error updating');
    }
});

bot.action(/^delete_task_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        const taskTitle = task?.title || 'Task';
        
        await db.collection('tasks').deleteOne({ taskId });
        await db.collection('history').deleteMany({ originalTaskId: taskId });
        cancelTaskSchedule(taskId);
        await ctx.answerCbQuery(`✅ Task Deleted`);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗧𝗔𝗦𝗞 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${taskTitle}</b>\n` +
                `🗑️ Task was deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting task:', error);
        await ctx.answerCbQuery('❌ Error deleting task');
    }
});

// ==========================================
// 🔄 REORDER TASKS SYSTEM
// ==========================================

bot.action('reorder_tasks_menu', async (ctx) => {
    try {
        const tasks = await db.collection('tasks')
            .find({ 
                status: 'pending'
            })
            .sort({ orderIndex: 1, nextOccurrence: 1 })
            .toArray();

        if (tasks.length === 0) {
            await ctx.answerCbQuery('📭 No tasks to reorder');
            return;
        }

        if (tasks.length === 1) {
            await ctx.answerCbQuery('❌ Need at least 2 tasks to reorder');
            return;
        }
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Select a task to move:\n\n';
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 35) title = title.substring(0, 32) + '...';
            
            keyboard.push([{ 
                text: `${index + 1}. ${title}`, 
                callback_data: `reorder_task_select_${task.taskId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder tasks menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^reorder_task_select_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        
        const tasks = await db.collection('tasks')
            .find({ 
                status: 'pending'
            })
            .sort({ orderIndex: 1, nextOccurrence: 1 })
            .toArray();
        
        const selectedIndex = tasks.findIndex(t => t.taskId === taskId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        ctx.session.reorderTask = {
            selectedTaskId: taskId,
            selectedIndex: selectedIndex,
            tasks: tasks
        };
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (selectedIndex < tasks.length - 1) {
            if (selectedIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_task_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_task_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_task_save' }, { text: '🔙 Back', callback_data: 'reorder_tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select task for reorder error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_task_up', async (ctx) => {
    try {
        if (!ctx.session.reorderTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderTask.selectedIndex;
        const tasks = [...ctx.session.reorderTask.tasks];
        
        if (selectedIndex <= 0) {
            await ctx.answerCbQuery('❌ Already at top');
            return;
        }
        
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex - 1];
        tasks[selectedIndex - 1] = temp;
        
        ctx.session.reorderTask.selectedIndex = selectedIndex - 1;
        ctx.session.reorderTask.tasks = tasks;
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderTask.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (newIndex < tasks.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_task_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_task_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_task_save' }, { text: '🔙 Back', callback_data: 'reorder_tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved up');
        
    } catch (error) {
        console.error('Move task up error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_task_down', async (ctx) => {
    try {
        if (!ctx.session.reorderTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderTask.selectedIndex;
        const tasks = [...ctx.session.reorderTask.tasks];
        
        if (selectedIndex >= tasks.length - 1) {
            await ctx.answerCbQuery('❌ Already at bottom');
            return;
        }
        
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex + 1];
        tasks[selectedIndex + 1] = temp;
        
        ctx.session.reorderTask.selectedIndex = selectedIndex + 1;
        ctx.session.reorderTask.tasks = tasks;
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderTask.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (newIndex < tasks.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_task_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_task_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_task_save' }, { text: '🔙 Back', callback_data: 'reorder_tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved down');
        
    } catch (error) {
        console.error('Move task down error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_task_save', async (ctx) => {
    try {
        if (!ctx.session.reorderTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const tasks = ctx.session.reorderTask.tasks;
        
        for (let i = 0; i < tasks.length; i++) {
            await db.collection('tasks').updateOne(
                { taskId: tasks[i].taskId },
                { $set: { orderIndex: i } }
            );
        }
        
        delete ctx.session.reorderTask;
        
        await ctx.answerCbQuery('✅ Task order saved!');
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Save task order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

// ==========================================
// 🔄 REORDER NOTES SYSTEM
// ==========================================

bot.action('reorder_notes_menu', async (ctx) => {
    try {
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();

        if (notes.length === 0) {
            await ctx.answerCbQuery('📭 No notes to reorder');
            return;
        }

        if (notes.length === 1) {
            await ctx.answerCbQuery('❌ Need at least 2 notes to reorder');
            return;
        }
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Select a note to move:\n\n';
        
        const keyboard = [];
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 35) title = title.substring(0, 32) + '...';
            
            keyboard.push([{ 
                text: `${index + 1}. ${title}`, 
                callback_data: `reorder_note_select_${note.noteId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder notes menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^reorder_note_select_(.+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        const selectedIndex = notes.findIndex(n => n.noteId === noteId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Note not found');
            return;
        }
        
        ctx.session.reorderNote = {
            selectedNoteId: noteId,
            selectedIndex: selectedIndex,
            notes: notes
        };
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (selectedIndex < notes.length - 1) {
            if (selectedIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_note_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_note_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_note_save' }, { text: '🔙 Back', callback_data: 'reorder_notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select note for reorder error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_note_up', async (ctx) => {
    try {
        if (!ctx.session.reorderNote) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderNote.selectedIndex;
        const notes = [...ctx.session.reorderNote.notes];
        
        if (selectedIndex <= 0) {
            await ctx.answerCbQuery('❌ Already at top');
            return;
        }
        
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex - 1];
        notes[selectedIndex - 1] = temp;
        
        ctx.session.reorderNote.selectedIndex = selectedIndex - 1;
        ctx.session.reorderNote.notes = notes;
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderNote.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (newIndex < notes.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_note_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_note_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_note_save' }, { text: '🔙 Back', callback_data: 'reorder_notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved up');
        
    } catch (error) {
        console.error('Move note up error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_note_down', async (ctx) => {
    try {
        if (!ctx.session.reorderNote) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderNote.selectedIndex;
        const notes = [...ctx.session.reorderNote.notes];
        
        if (selectedIndex >= notes.length - 1) {
            await ctx.answerCbQuery('❌ Already at bottom');
            return;
        }
        
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex + 1];
        notes[selectedIndex + 1] = temp;
        
        ctx.session.reorderNote.selectedIndex = selectedIndex + 1;
        ctx.session.reorderNote.notes = notes;
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderNote.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (newIndex < notes.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_note_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_note_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_note_save' }, { text: '🔙 Back', callback_data: 'reorder_notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved down');
        
    } catch (error) {
        console.error('Move note down error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_note_save', async (ctx) => {
    try {
        if (!ctx.session.reorderNote) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const notes = ctx.session.reorderNote.notes;
        
        for (let i = 0; i < notes.length; i++) {
            await db.collection('notes').updateOne(
                { noteId: notes[i].noteId },
                { $set: { orderIndex: i } }
            );
        }
        
        delete ctx.session.reorderNote;
        
        await ctx.answerCbQuery('✅ Note order saved!');
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Save note order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

// ==========================================
// 📜 VIEW HISTORY - WITH PAGINATION
// ==========================================

bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const dates = await db.collection('history').aggregate([
        { 
            $group: { 
                _id: { 
                    year: { $year: "$completedDate" },
                    month: { $month: "$completedDate" },
                    day: { $dayOfMonth: "$completedDate" }
                },
                count: { $sum: 1 },
                completedDate: { $first: "$completedDate" }
            }
        },
        { $sort: { completedDate: -1 } },
        { 
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: perPage }]
            }
        }
    ]).toArray();

    const totalDates = dates[0]?.metadata[0]?.total || 0;
    const dateList = dates[0]?.data || [];
    const totalPages = Math.max(1, Math.ceil(totalDates / perPage));

    let text = `📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗛𝗜𝗦𝗧𝗢𝗥𝗬</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalDates} date${totalDates !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (dateList.length === 0) {
        text += '📭 No history available.';
    } else {
        text += 'Select a date to view:';
    }
    
    const buttons = dateList.map(d => {
        const date = new Date(d.completedDate);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return [Markup.button.callback(`📅 ${formatDateUTC(date)} (${d.count})`, `hist_list_${dateStr}_1`)];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', `view_history_dates_${page - 1}`));
        }
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `view_history_dates_${page + 1}`));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_list_([\d-]+)_(\d+)$/, async (ctx) => {
    const dateStr = ctx.match[1];
    const page = parseInt(ctx.match[2]);

    const [year, month, day] = dateStr.split('-').map(Number);
    
    const selectedDate = new Date(Date.UTC(year, month - 1, day));
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalTasks = await db.collection('history').countDocuments({
        completedDate: {
            $gte: selectedDate,
            $lt: nextDay
        }
    });
    
    const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));

    const tasks = await db.collection('history').find({
        completedDate: {
            $gte: selectedDate,
            $lt: nextDay
        }
    }).sort({ completedAt: -1 }).skip(skip).limit(perPage).toArray();

    const date = new Date(year, month - 1, day);
    let text = `📅 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗢𝗡 ${formatDateUTC(date).toUpperCase()}</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (tasks.length === 0) {
        text += '📭 No tasks completed on this date.';
    } else {
        text += 'Select a task to view details:';
    }
    
    const buttons = tasks.map((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        if (t.subtasks && t.subtasks.length > 0) {
            const completed = t.subtasks.filter(s => s.completed).length;
            taskTitle += ` [${completed}/${t.subtasks.length}]`;
        }
        
        if (taskTitle.length > 40) taskTitle = taskTitle.substring(0, 37) + '...';
        
        return [
            Markup.button.callback(`✅ ${taskNum}. ${taskTitle} (${formatTimeUTC(t.completedAt)} UTC)`, `hist_det_${t._id}`)
        ];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', `hist_list_${dateStr}_${page - 1}`));
        }
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `hist_list_${dateStr}_${page + 1}`));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    try {
        const id = ctx.match[1];
        const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

        if (!task) {
            await ctx.answerCbQuery('Task not found');
            return;
        }

        const duration = calculateDuration(task.startDate, task.endDate);

        let text = `
📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗧𝗔𝗜𝗟</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${formatBlockquote(task.description)}
✅ <b>Completed At:</b> ${formatDateTimeUTC(task.completedAt)} UTC
${task.autoCompleted ? '🤖 <b>Auto-completed at 23:59 UTC</b>\n' : ''}
⏰ <b>Original Time:</b> ${formatTimeUTC(task.startDate)} - ${formatTimeUTC(task.endDate)} UTC
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
━━━━━━━━━━━━━━━━━━━━
`;

        if (task.subtasks && task.subtasks.length > 0) {
            text += `📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b>\n`;
            task.subtasks.forEach((subtask, index) => {
                const status = subtask.completed ? '✅' : '❌';
                let title = subtask.title;
                if (title.length > 40) title = title.substring(0, 37) + '...';
                text += `${status} ${index + 1}. ${title}\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n`;
        }

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to History', 'view_history_dates_1')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error showing history detail:', error);
        await ctx.answerCbQuery('❌ Error loading history detail');
    }
});

// ==========================================
// 🗒️ VIEW NOTES - WITH PAGINATION
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalNotes = await db.collection('notes').countDocuments({});
    const totalPages = Math.max(1, Math.ceil(totalNotes / perPage));
    
    const notes = await db.collection('notes').find()
        .sort({ orderIndex: 1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    let text = `🗒️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalNotes} note${totalNotes !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (notes.length === 0) {
        text += '📭 No notes yet.';
    } else {
        text += 'Select a note to view:';
    }
    
    const buttons = notes.map((n, index) => {
        const noteNum = skip + index + 1;
        let title = n.title;
        if (title.length > 40) title = title.substring(0, 37) + '...';
        
        return [
            Markup.button.callback(`📄 ${noteNum}. ${title}`, `note_det_${n.noteId}`)
        ];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', `view_notes_${page - 1}`));
        }
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `view_notes_${page + 1}`));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    await showNoteDetail(ctx, ctx.match[1]);
});

async function showNoteDetail(ctx, noteId) {
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        const text = '❌ <b>𝗡𝗢𝗧𝗘 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis note may have been deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🗒️ Notes', 'view_notes_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    let contentDisplay = note.content || '<i>Empty note</i>';
    
    const text = `
📝 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>
${formatBlockquote(contentDisplay)}
📅 <b>Created:</b> ${formatDateTimeUTC(note.createdAt)} UTC
${note.updatedAt ? `✏️ <b>Updated:</b> ${formatDateTimeUTC(note.updatedAt)} UTC` : ''}
🏷️ <b>Order:</b> ${note.orderIndex + 1}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [
        [
            Markup.button.callback('✏️ Edit Title', `edit_note_title_${note.noteId}`), 
            Markup.button.callback('✏️ Edit Content', `edit_note_content_${note.noteId}`)
        ],
        [
            Markup.button.callback('🗑️ Delete', `delete_note_${note.noteId}`),
            Markup.button.callback('🔙 Back to Notes', 'view_notes_1')
        ]
    ];

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// ==========================================
// ✏️ EDIT NOTE HANDLERS
// ==========================================

bot.action(/^edit_note_title_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_title';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title:`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
        }
    );
});

bot.action(/^edit_note_content_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_content';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new content (Max 400 words, enter "-" for empty):`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
        }
    );
});

bot.action(/^delete_note_(.+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const note = await db.collection('notes').findOne({ noteId });
        const noteTitle = note?.title || 'Note';
        
        await db.collection('notes').deleteOne({ noteId: noteId });
        await ctx.answerCbQuery('✅ Note Deleted');
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗡𝗢𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${noteTitle}</b>\n` +
                `🗑️ Note was deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting note:', error);
        await ctx.answerCbQuery('❌ Error deleting note');
    }
});

// ==========================================
// 📥 DOWNLOAD DATA MENU
// ==========================================

bot.action('download_menu', async (ctx) => {
    const text = `📥 <b>𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n📁 <i>Files will be sent as JSON documents</i>`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Active Tasks', 'download_tasks')],
        [Markup.button.callback('📜 History', 'download_history')],
        [Markup.button.callback('🗒️ Notes', 'download_notes')],
        [Markup.button.callback('📦 All Data (3 files)', 'download_all')],
        [Markup.button.callback('🔙 Back', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('download_tasks', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching tasks...');
        const tasks = await db.collection('tasks').find().toArray();
        
        const tasksData = {
            total: tasks.length,
            downloadedAt: new Date().toISOString(),
            data: tasks.length > 0 ? tasks : []
        };
        
        const tasksJson = JSON.stringify(tasksData, null, 2);
        const tasksBuff = Buffer.from(tasksJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: tasksBuff,
            filename: `global_tasks_${Date.now()}.json`
        }, {
            caption: `📋 <b>Global Tasks Data</b>\nTotal: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}\n📅 ${formatDateTimeUTC(new Date())} UTC`,
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery(`✅ Sent ${tasks.length} tasks`);
    } catch (error) {
        console.error('Error downloading tasks:', error);
        await ctx.answerCbQuery('❌ Error sending tasks file');
        await ctx.reply('❌ Failed to send tasks file. Please try again.');
    }
});

bot.action('download_history', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching history...');
        const history = await db.collection('history').find().toArray();
        
        const historyData = {
            total: history.length,
            downloadedAt: new Date().toISOString(),
            data: history.length > 0 ? history : []
        };
        
        const historyJson = JSON.stringify(historyData, null, 2);
        const histBuff = Buffer.from(historyJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: histBuff,
            filename: `global_history_${Date.now()}.json`
        }, {
            caption: `📜 <b>Global History Data</b>\nTotal: ${history.length} item${history.length !== 1 ? 's' : ''}\n📅 ${formatDateTimeUTC(new Date())} UTC`,
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery(`✅ Sent ${history.length} history items`);
    } catch (error) {
        console.error('Error downloading history:', error);
        await ctx.answerCbQuery('❌ Error sending history file');
        await ctx.reply('❌ Failed to send history file. Please try again.');
    }
});

bot.action('download_notes', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching notes...');
        const notes = await db.collection('notes').find().toArray();
        
        const notesData = {
            total: notes.length,
            downloadedAt: new Date().toISOString(),
            data: notes.length > 0 ? notes : []
        };
        
        const notesJson = JSON.stringify(notesData, null, 2);
        const notesBuff = Buffer.from(notesJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: notesBuff,
            filename: `global_notes_${Date.now()}.json`
        }, {
            caption: `🗒️ <b>Global Notes Data</b>\nTotal: ${notes.length} note${notes.length !== 1 ? 's' : ''}\n📅 ${formatDateTimeUTC(new Date())} UTC`,
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery(`✅ Sent ${notes.length} notes`);
    } catch (error) {
        console.error('Error downloading notes:', error);
        await ctx.answerCbQuery('❌ Error sending notes file');
        await ctx.reply('❌ Failed to send notes file. Please try again.');
    }
});

bot.action('download_all', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Preparing all data...');
        const timestamp = Date.now();
        
        const [tasks, history, notes] = await Promise.all([
            db.collection('tasks').find().toArray(),
            db.collection('history').find().toArray(),
            db.collection('notes').find().toArray()
        ]);
        
        const totalItems = tasks.length + history.length + notes.length;
        
        if (tasks.length > 0) {
            const tasksData = {
                total: tasks.length,
                downloadedAt: new Date().toISOString(),
                data: tasks
            };
            const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: tasksBuff,
                filename: `global_tasks_${timestamp}.json`
            }, {
                caption: `📋 <b>Tasks</b> (${tasks.length} item${tasks.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        if (history.length > 0) {
            const historyData = {
                total: history.length,
                downloadedAt: new Date().toISOString(),
                data: history
            };
            const histBuff = Buffer.from(JSON.stringify(historyData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: histBuff,
                filename: `global_history_${timestamp}.json`
            }, {
                caption: `📜 <b>History</b> (${history.length} item${history.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        if (notes.length > 0) {
            const notesData = {
                total: notes.length,
                downloadedAt: new Date().toISOString(),
                data: notes
            };
            const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: notesBuff,
                filename: `global_notes_${timestamp}.json`
            }, {
                caption: `🗒️ <b>Notes</b> (${notes.length} item${notes.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        await ctx.reply(
            `📦 <b>ALL GLOBAL DATA DOWNLOAD COMPLETE</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Tasks: ${tasks.length} item${tasks.length !== 1 ? 's' : ''}\n` +
            `📜 History: ${history.length} item${history.length !== 1 ? 's' : ''}\n` +
            `🗒️ Notes: ${notes.length} item${notes.length !== 1 ? 's' : ''}\n` +
            `📊 Total: ${totalItems} items\n` +
            `📁 ${[tasks, history, notes].filter(a => a.length > 0).length} JSON files sent\n` +
            `📅 ${formatDateTimeUTC(new Date())} UTC\n━━━━━━━━━━━━━━━━━━━━`,
            { parse_mode: 'HTML' }
        );
        
        await ctx.answerCbQuery(`✅ Sent ${totalItems} items across ${[tasks, history, notes].filter(a => a.length > 0).length} files`);
    } catch (error) {
        console.error('Error downloading all data:', error);
        await ctx.answerCbQuery('❌ Error sending files');
        await ctx.reply('❌ Failed to send files. Please try again.');
    }
});

// ==========================================
// 🗑️ DELETE DATA MENU - GLOBAL
// ==========================================

bot.action('delete_menu', async (ctx) => {
    try {
        const text = `🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>⚠️ WARNING: This will delete data for EVERYONE!</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Select what to delete:</b>`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
            [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
            [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
            [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_menu:', error);
        await ctx.answerCbQuery('❌ Error loading delete menu');
    }
});

bot.action('delete_tasks_confirm', async (ctx) => {
    try {
        const taskCount = await db.collection('tasks').countDocuments({});
        
        const text = `⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${taskCount} GLOBAL task${taskCount !== 1 ? 's' : ''}?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL TASKS', 'delete_tasks_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_tasks_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_tasks_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const tasks = await db.collection('tasks').find().toArray();
        
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        const result = await db.collection('tasks').deleteMany({});
        
        if (tasks.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `global_tasks_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} global task${result.deletedCount !== 1 ? 's' : ''}\n${tasks.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${result.deletedCount} tasks have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting tasks:', error);
        await ctx.answerCbQuery('❌ Error deleting tasks');
        await showMainMenu(ctx);
    }
});

bot.action('delete_history_confirm', async (ctx) => {
    try {
        const historyCount = await db.collection('history').countDocuments({});
        
        const text = `⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${historyCount} GLOBAL history item${historyCount !== 1 ? 's' : ''}?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL HISTORY', 'delete_history_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_history_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_history_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const history = await db.collection('history').find().toArray();
        
        const result = await db.collection('history').deleteMany({});
        
        if (history.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(history, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `global_history_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} global history item${result.deletedCount !== 1 ? 's' : ''}\n${history.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${result.deletedCount} history items have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting history:', error);
        await ctx.answerCbQuery('❌ Error deleting history');
        await showMainMenu(ctx);
    }
});

bot.action('delete_notes_confirm', async (ctx) => {
    try {
        const notesCount = await db.collection('notes').countDocuments({});
        
        const text = `⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${notesCount} GLOBAL note${notesCount !== 1 ? 's' : ''}?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL NOTES', 'delete_notes_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_notes_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_notes_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const notes = await db.collection('notes').find().toArray();
        
        const result = await db.collection('notes').deleteMany({});
        
        if (notes.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(notes, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `global_notes_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} global note${result.deletedCount !== 1 ? 's' : ''}\n${notes.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${result.deletedCount} notes have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting notes:', error);
        await ctx.answerCbQuery('❌ Error deleting notes');
        await showMainMenu(ctx);
    }
});

bot.action('delete_all_confirm', async (ctx) => {
    try {
        const [tasksCount, historyCount, notesCount] = await Promise.all([
            db.collection('tasks').countDocuments({}),
            db.collection('history').countDocuments({}),
            db.collection('notes').countDocuments({})
        ]);
        const totalCount = tasksCount + historyCount + notesCount;
        
        const text = `⚠️ <b>⚠️ ⚠️ ⚠️ FINAL WARNING ⚠️ ⚠️ ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${totalCount} GLOBAL items?\n\n<b>⚠️ THIS WILL DELETE EVERYTHING FOR EVERYONE!</b>\n\n📋 Tasks: ${tasksCount}\n📜 History: ${historyCount}\n🗒️ Notes: ${notesCount}\n\n<b>⚠️ THIS ACTION CANNOT BE UNDONE!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔥 YES, DELETE EVERYTHING GLOBAL', 'delete_all_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_all_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_all_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const [tasks, history, notes] = await Promise.all([
            db.collection('tasks').find().toArray(),
            db.collection('history').find().toArray(),
            db.collection('notes').find().toArray()
        ]);
        
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        const [tasksResult, historyResult, notesResult] = await Promise.all([
            db.collection('tasks').deleteMany({}),
            db.collection('history').deleteMany({}),
            db.collection('notes').deleteMany({})
        ]);
        
        const totalDeleted = tasksResult.deletedCount + historyResult.deletedCount + notesResult.deletedCount;
        const timestamp = Date.now();
        
        if (tasks.length > 0) {
            const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            await ctx.replyWithDocument({ 
                source: tasksBuff, 
                filename: `global_all_backup_tasks_${timestamp}.json` 
            });
        }
        
        if (history.length > 0) {
            const histBuff = Buffer.from(JSON.stringify(history, null, 2));
            await ctx.replyWithDocument({ 
                source: histBuff, 
                filename: `global_all_backup_history_${timestamp}.json` 
            });
        }
        
        if (notes.length > 0) {
            const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
            await ctx.replyWithDocument({ 
                source: notesBuff, 
                filename: `global_all_backup_notes_${timestamp}.json` 
            });
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${totalDeleted} items total\n\n📋 Tasks: ${tasksResult.deletedCount}\n📜 History: ${historyResult.deletedCount}\n🗒️ Notes: ${notesResult.deletedCount}\n\n${(tasks.length + history.length + notes.length) > 0 ? '📁 Backup files sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🔥 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗔𝗟𝗟 𝗗𝗔𝗧𝗔 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${totalDeleted} items have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting all data:', error);
        await ctx.answerCbQuery('❌ Error deleting data');
        await showMainMenu(ctx);
    }
});

// Dummy action for pagination
bot.action('no_action', async (ctx) => {
    await ctx.answerCbQuery();
});

// ==========================================
// ⏰ HOURLY SUMMARY - MODIFIED FOR YOUR USER
// ==========================================

async function sendHourlySummary() {
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const [completedTasks, pendingTasks] = await Promise.all([
            db.collection('history').find({
                completedAt: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ completedAt: 1 }).toArray(),
            
            db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray()
        ]);
        
        let summaryText = `
🕰️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗔𝗟𝗙 𝗛𝗢𝗨𝗥𝗟𝗬 𝗦𝗨𝗠𝗠𝗔𝗥𝗬</b>
⏰ ${formatTimeUTC(new Date())} UTC ‧ 📅 ${formatDateUTC(new Date())}
━━━━━━━━━━━━━━━━━━━━
✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗢𝗗𝗔𝗬:</b> (${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''})`;
        
        if (completedTasks.length > 0) {
            completedTasks.slice(0, 5).forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTimeUTC(task.completedAt)} UTC`;
            });
            if (completedTasks.length > 5) {
                summaryText += `\n...and ${completedTasks.length - 5} more`;
            }
        } else {
            summaryText += `\n📭 No tasks completed yet.`;
        }
        
        summaryText += `\n\n⏳ <b>𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗧𝗢𝗗𝗔𝗬:</b> (${pendingTasks.length} task${pendingTasks.length !== 1 ? 's' : ''})`;
        
        if (pendingTasks.length > 0) {
            pendingTasks.slice(0, 5).forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTimeUTC(task.nextOccurrence)} UTC`;
            });
            if (pendingTasks.length > 5) {
                summaryText += `\n...and ${pendingTasks.length - 5} more`;
            }
        } else {
            summaryText += `\n📭 No pending tasks for today`;
        }
        
        summaryText += `\n━━━━━━━━━━━━━━━━━━━━\n⏰ Next update in 30 minutes`;
        
        try {
            await bot.telegram.sendMessage(CHAT_ID, summaryText, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Error sending hourly summary:', e.message);
        }
        
    } catch (error) {
        console.error('Error generating hourly summary:', error.message);
    }
}

function scheduleHourlySummary() {
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    hourlySummaryJob = schedule.scheduleJob('*/30 * * * *', async () => {
        if (isShuttingDown) return;
        console.log(`⏰ Sending global hourly summaries at ${formatTimeUTC(new Date())} UTC...`);
        await sendHourlySummary();
    });
    
    console.log('✅ Global half-hourly summary scheduler started');
}

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================

async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            scheduleHourlySummary();
            scheduleAutoComplete();
            
            // Start Express server
            const server = app.listen(PORT, '0.0.0.0', () => {
                console.log(`🌐 Web interface running on port ${PORT}`);
                console.log(`📱 Web URL: http://localhost:${PORT}`);
                console.log(`🌍 Public Web URL: ${WEB_APP_URL}`);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`❌ Port ${PORT} is already in use. Trying port ${PORT + 1}...`);
                    app.listen(PORT + 1, '0.0.0.0', () => {
                        console.log(`🌐 Web interface running on port ${PORT + 1}`);
                        console.log(`📱 Web URL: http://localhost:${PORT + 1}`);
                    });
                } else {
                    console.error('❌ Express server error:', err);
                }
            });
            
            // Start Telegram bot
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
            console.log(`👤 Bot only responding to user ID: ${CHAT_ID}`);
            console.log(`⏰ Current UTC Time: ${formatTimeUTC(new Date())}`);
            console.log(`📊 Currently tracking ${activeSchedules.size} tasks`);
            
            // Send initial summary
            setTimeout(async () => {
                try {
                    const tasks = await db.collection('tasks').find({
                        nextOccurrence: {
                            $gte: getTodayUTC(),
                            $lt: getTomorrowUTC()
                        }
                    }).toArray();
                    
                    if (tasks.length > 0) {
                        await bot.telegram.sendMessage(CHAT_ID,
                            `📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>\n` +
                            `━━━━━━━━━━━━━━━━━━━━\n` +
                            `📊 Total: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}\n` +
                            `📅 ${formatDateUTC(new Date())} UTC\n` +
                            `━━━━━━━━━━━━━━━━━━━━`,
                            { parse_mode: 'HTML' }
                        );
                    }
                } catch (error) {
                    console.error('Error sending initial summary:', error.message);
                }
            }, 5000);
        } else {
            console.error('❌ Failed to connect to database. Retrying in 5 seconds...');
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        setTimeout(start, 10000);
    }
}

// ==========================================
// 🛑 GRACEFUL SHUTDOWN
// ==========================================

function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`🛑 ${signal} received, stopping bot gracefully...`);
    
    // Cancel all scheduled jobs
    for (const [taskId, schedule] of activeSchedules) {
        try {
            if (schedule.startJob) schedule.startJob.cancel();
            if (schedule.interval) clearInterval(schedule.interval);
        } catch (e) {
            console.error(`Error cleaning up task ${taskId}:`, e.message);
        }
    }
    
    if (hourlySummaryJob) {
        try { hourlySummaryJob.cancel(); } catch (e) {}
    }
    
    if (autoCompleteJob) {
        try { autoCompleteJob.cancel(); } catch (e) {}
    }
    
    bot.stop(signal).catch(e => console.error('Error stopping bot:', e.message));
    
    if (client) {
        client.close().catch(e => console.error('Error closing MongoDB:', e.message));
    }
    
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
start();

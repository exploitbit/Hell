
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
const PORT = process.env.PORT || 8080;
const WEB_APP_URL = 'https://task-manager-bot.up.railway.app';
const CHAT_ID = 8469993808;

const app = express();

// ==========================================
// 🎨 EXPRESS CONFIGURATION
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(viewsDir)) {
    fs.mkdirSync(viewsDir, { recursive: true });
}

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// ==========================================
// 🎨 EJS TEMPLATE - FIXED WITH ALL IMPROVEMENTS
// ==========================================
function writeMainEJS() {
    const mainEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Global Task Manager</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        :root {
            --bg-light: #f5f7fa;
            --card-bg-light: #ffffff;
            --text-primary-light: #1e293b;
            --text-secondary-light: #475569;
            --border-light: #e2e8f0;
            --accent-light: #2563eb;
            --accent-soft-light: #dbeafe;
            --success-light: #059669;
            --warning-light: #d97706;
            --danger-light: #dc2626;
            --hover-light: #f1f5f9;
            --progress-bg-light: #e2e8f0;
            
            --bg-dark: #0f172a;
            --card-bg-dark: #1e293b;
            --text-primary-dark: #f8fafc;
            --text-secondary-dark: #cbd5e1;
            --border-dark: #334155;
            --accent-dark: #60a5fa;
            --accent-soft-dark: #1e3a5f;
            --success-dark: #34d399;
            --warning-dark: #fbbf24;
            --danger-dark: #f87171;
            --hover-dark: #2d3b4f;
            --progress-bg-dark: #334155;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        body {
            background: var(--bg-light);
            color: var(--text-primary-light);
            transition: all 0.2s ease;
            min-height: 100vh;
            font-size: 13px;
            line-height: 1.4;
        }

        @media (prefers-color-scheme: dark) {
            body {
                background: var(--bg-dark);
                color: var(--text-primary-dark);
            }
        }

        .app-header {
            background: var(--card-bg-light);
            border-bottom: 1px solid var(--border-light);
            padding: 10px 16px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        @media (prefers-color-scheme: dark) {
            .app-header {
                background: var(--card-bg-dark);
                border-bottom: 1px solid var(--border-dark);
            }
        }

        .nav-container {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
        }

        .nav-links {
            display: flex;
            gap: 4px;
            background: var(--hover-light);
            padding: 3px;
            border-radius: 100px;
        }

        @media (prefers-color-scheme: dark) {
            .nav-links {
                background: var(--hover-dark);
            }
        }

        .nav-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 100px;
            border: none;
            background: transparent;
            color: var(--text-secondary-light);
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        @media (prefers-color-scheme: dark) {
            .nav-btn {
                color: var(--text-secondary-dark);
            }
        }

        .nav-btn.active {
            background: var(--card-bg-light);
            color: var(--accent-light);
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }

        @media (prefers-color-scheme: dark) {
            .nav-btn.active {
                background: var(--card-bg-dark);
                color: var(--accent-dark);
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }
        }

        .time-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--accent-soft-light);
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--accent-light);
        }

        @media (prefers-color-scheme: dark) {
            .time-badge {
                background: var(--accent-soft-dark);
                color: var(--accent-dark);
            }
        }

        .main-content {
            max-width: 1400px;
            margin: 16px auto;
            padding: 0 16px;
            padding-bottom: 80px;
        }

        .page-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 16px;
        }

        .tasks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 16px;
            margin-top: 16px;
        }

        .task-card, .note-card, .history-date-card {
            background: var(--card-bg-light);
            border: 1px solid var(--border-light);
            border-radius: 16px;
            padding: 16px;
            transition: all 0.2s ease;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        @media (prefers-color-scheme: dark) {
            .task-card, .note-card, .history-date-card {
                background: var(--card-bg-dark);
                border: 1px solid var(--border-dark);
            }
        }

        .note-card {
            margin-bottom: 12px;
        }

        .task-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
            width: 100%;
        }

        .task-title-section {
            flex: 1;
            min-width: 0;
        }

        .task-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary-light);
            margin-bottom: 4px;
            line-height: 1.3;
            word-break: break-word;
            cursor: pointer;
            display: inline-block;
        }

        @media (prefers-color-scheme: dark) {
            .task-title {
                color: var(--text-primary-dark);
            }
        }

        .task-description-container {
            margin: 8px 0 4px 0;
            width: 100%;
        }

        .task-description {
            font-size: 0.85rem;
            color: var(--text-secondary-light);
            padding: 6px 12px;
            background: var(--hover-light);
            border-radius: 0 10px 10px 0;
            border-left: 3px solid var(--accent-light);
            word-break: break-word;
            white-space: pre-wrap;
            width: fit-content;
            max-width: 100%;
            box-sizing: border-box;
            line-height: 1.4;
        }

        @media (prefers-color-scheme: dark) {
            .task-description {
                color: var(--text-secondary-dark);
                background: var(--hover-dark);
            }
        }

        .task-time-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            margin: 8px 0 4px 0;
        }

        .date-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            background: var(--hover-light);
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--text-secondary-light);
            width: fit-content;
        }

        .time-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            background: var(--hover-light);
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--text-secondary-light);
            width: fit-content;
        }

        @media (prefers-color-scheme: dark) {
            .date-chip, .time-chip {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        .task-actions {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }

        .action-btn {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            border: none;
            background: var(--hover-light);
            color: var(--text-secondary-light);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.8rem;
        }

        @media (prefers-color-scheme: dark) {
            .action-btn {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        .action-btn:hover {
            background: var(--accent-light);
            color: white;
        }

        .action-btn.delete:hover {
            background: var(--danger-light);
        }

        .progress-section {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 12px 0;
            cursor: pointer;
        }

        .progress-ring-small {
            position: relative;
            width: 40px;
            height: 40px;
        }

        .progress-ring-circle-small {
            transition: stroke-dashoffset 0.5s;
            transform: rotate(-90deg);
            transform-origin: 50% 50%;
        }

        .progress-text-small {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 0.7rem;
            font-weight: 700;
            color: var(--accent-light);
        }

        @media (prefers-color-scheme: dark) {
            .progress-text-small {
                color: var(--accent-dark);
            }
        }

        .subtasks-container {
            margin-top: 12px;
            border-top: 1px solid var(--border-light);
            padding-top: 12px;
            width: 100%;
        }

        @media (prefers-color-scheme: dark) {
            .subtasks-container {
                border-top-color: var(--border-dark);
            }
        }

        .subtask-item {
            display: flex;
            flex-direction: column;
            background: var(--hover-light);
            border-radius: 10px;
            margin-bottom: 8px;
            padding: 8px;
            width: 100%;
        }

        @media (prefers-color-scheme: dark) {
            .subtask-item {
                background: var(--hover-dark);
            }
        }

        .subtask-main-row {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            width: 100%;
        }

        .subtask-checkbox {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            border: 2px solid var(--accent-light);
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            color: white;
            font-size: 0.7rem;
            flex-shrink: 0;
            margin-top: 1px;
        }

        .subtask-checkbox.completed {
            background: var(--success-light);
            border-color: var(--success-light);
        }

        .subtask-details {
            flex: 1;
            min-width: 0;
        }

        .subtask-title {
            font-weight: 600;
            color: var(--text-primary-light);
            margin-bottom: 2px;
            font-size: 0.85rem;
            word-break: break-word;
            cursor: pointer;
        }

        .subtask-title.completed {
            text-decoration: line-through;
            color: var(--text-secondary-light);
        }

        .subtask-actions {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }

        .subtask-btn {
            width: 26px;
            height: 26px;
            border-radius: 6px;
            border: none;
            background: var(--card-bg-light);
            color: var(--text-secondary-light);
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.75rem;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @media (prefers-color-scheme: dark) {
            .subtask-btn {
                background: var(--card-bg-dark);
                color: var(--text-secondary-dark);
            }
        }

        .subtask-btn:hover {
            background: var(--accent-light);
            color: white;
        }

        .subtask-btn.delete:hover {
            background: var(--danger-light);
        }

        .subtask-description-container {
            margin-top: 6px;
            margin-left: 28px;
            width: calc(100% - 28px);
        }

        .subtask-description {
            font-size: 0.8rem;
            color: var(--text-secondary-light);
            padding: 6px 12px;
            background: var(--card-bg-light);
            border-radius: 0 8px 8px 0;
            border-left: 2px solid var(--accent-light);
            word-break: break-word;
            white-space: pre-wrap;
            width: fit-content;
            max-width: 100%;
            box-sizing: border-box;
            line-height: 1.4;
        }

        @media (prefers-color-scheme: dark) {
            .subtask-description {
                background: var(--card-bg-dark);
                color: var(--text-secondary-dark);
            }
        }

        .badge {
            display: inline-flex;
            align-items: center;
            padding: 3px 8px;
            border-radius: 100px;
            font-size: 0.7rem;
            font-weight: 600;
            gap: 4px;
            background: var(--hover-light);
            color: var(--text-secondary-light);
            width: fit-content;
        }

        @media (prefers-color-scheme: dark) {
            .badge {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
            width: 100%;
        }

        .note-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary-light);
            word-break: break-word;
            flex: 1;
            cursor: pointer;
        }

        @media (prefers-color-scheme: dark) {
            .note-title {
                color: var(--text-primary-dark);
            }
        }

        .note-content-container {
            margin: 4px 0 8px 0;
            width: 100%;
        }

        .note-content {
            font-size: 0.85rem;
            color: var(--text-secondary-light);
            padding: 6px 12px;
            background: var(--hover-light);
            border-radius: 0 10px 10px 0;
            border-left: 3px solid var(--accent-light);
            word-break: break-word;
            white-space: pre-wrap;
            width: fit-content;
            max-width: 100%;
            box-sizing: border-box;
            line-height: 1.4;
        }

        @media (prefers-color-scheme: dark) {
            .note-content {
                color: var(--text-secondary-dark);
                background: var(--hover-dark);
            }
        }

        .note-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--border-light);
            font-size: 0.7rem;
            color: var(--text-secondary-light);
        }

        @media (prefers-color-scheme: dark) {
            .note-meta {
                border-top-color: var(--border-dark);
                color: var(--text-secondary-dark);
            }
        }

        .history-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 12px;
        }

        .month-selector {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .month-btn {
            padding: 6px 12px;
            border-radius: 100px;
            border: 1px solid var(--border-light);
            background: var(--card-bg-light);
            color: var(--text-primary-light);
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        @media (prefers-color-scheme: dark) {
            .month-btn {
                background: var(--card-bg-dark);
                border-color: var(--border-dark);
                color: var(--text-primary-dark);
            }
        }

        .history-date-card {
            margin-bottom: 16px;
        }

        .history-tasks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
            margin-top: 12px;
        }

        .history-task-card {
            background: var(--hover-light);
            border-radius: 12px;
            padding: 12px;
            border-left: 3px solid var(--success-light);
            word-break: break-word;
            width: 100%;
        }

        @media (prefers-color-scheme: dark) {
            .history-task-card {
                background: var(--hover-dark);
            }
        }

        .history-task-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
        }

        .history-task-title {
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--text-primary-light);
            cursor: pointer;
            word-break: break-word;
            flex: 1;
        }

        @media (prefers-color-scheme: dark) {
            .history-task-title {
                color: var(--text-primary-dark);
            }
        }

        .history-task-time {
            font-size: 0.7rem;
            color: var(--text-secondary-light);
            flex-shrink: 0;
            margin-left: auto;
            padding-left: 8px;
        }

        .history-description-container {
            margin: 6px 0 8px 0;
            width: 100%;
        }

        .history-description {
            font-size: 0.8rem;
            color: var(--text-secondary-light);
            padding: 6px 12px;
            background: var(--card-bg-light);
            border-radius: 0 8px 8px 0;
            border-left: 2px solid var(--success-light);
            word-break: break-word;
            white-space: pre-wrap;
            width: fit-content;
            max-width: 100%;
            box-sizing: border-box;
            line-height: 1.4;
        }

        @media (prefers-color-scheme: dark) {
            .history-description {
                background: var(--card-bg-dark);
                color: var(--text-secondary-dark);
            }
        }

        .history-subtask {
            padding: 6px 6px 6px 20px;
            border-left: 2px solid var(--border-light);
            margin: 6px 0;
            width: 100%;
        }

        @media (prefers-color-scheme: dark) {
            .history-subtask {
                border-left-color: var(--border-dark);
            }
        }

        .fab {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            border-radius: 28px;
            background: var(--accent-light);
            color: white;
            border: none;
            font-size: 1.3rem;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(37,99,235,0.3);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99;
        }

        @media (prefers-color-scheme: dark) {
            .fab {
                background: var(--accent-dark);
                box-shadow: 0 4px 12px rgba(96,165,250,0.3);
            }
        }

        .fab:hover {
            transform: scale(1.05);
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content {
            background: var(--card-bg-light);
            border: 1px solid var(--border-light);
            border-radius: 24px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 85vh;
            overflow-y: auto;
        }

        @media (prefers-color-scheme: dark) {
            .modal-content {
                background: var(--card-bg-dark);
                border: 1px solid var(--border-dark);
            }
        }

        .form-control {
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--border-light);
            background: var(--bg-light);
            color: var(--text-primary-light);
            font-size: 0.9rem;
            font-family: 'Inter', sans-serif;
            resize: vertical;
        }

        textarea.form-control {
            min-height: 80px;
        }

        @media (prefers-color-scheme: dark) {
            .form-control {
                background: var(--bg-dark);
                border: 1px solid var(--border-dark);
                color: var(--text-primary-dark);
            }
        }

        .btn {
            padding: 12px 20px;
            border-radius: 100px;
            border: none;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: var(--accent-light);
            color: white;
        }

        @media (prefers-color-scheme: dark) {
            .btn-primary {
                background: var(--accent-dark);
            }
        }

        .btn-secondary {
            background: var(--hover-light);
            color: var(--text-secondary-light);
        }

        @media (prefers-color-scheme: dark) {
            .btn-secondary {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        }

        .toast {
            background: #1e293b;
            color: white;
            padding: 10px 20px;
            border-radius: 100px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 0.85rem;
            font-weight: 500;
        }

        @media (prefers-color-scheme: dark) {
            .toast {
                background: #0f172a;
            }
        }

        .loader {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9998;
        }

        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid var(--border-light);
            border-top: 4px solid var(--accent-light);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @media (prefers-color-scheme: dark) {
            .spinner {
                border: 4px solid var(--border-dark);
                border-top: 4px solid var(--accent-dark);
            }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary-light);
            background: var(--hover-light);
            border-radius: 24px;
        }

        @media (prefers-color-scheme: dark) {
            .empty-state {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        .task-title-container {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .task-title-container i {
            font-size: 0.8rem;
            color: var(--accent-light);
        }

        .hidden {
            display: none;
        }

        .fit-content {
            width: fit-content;
        }

        @media (max-width: 768px) {
            .nav-container {
                flex-direction: column;
                align-items: stretch;
            }
            
            .nav-links {
                width: 100%;
                justify-content: stretch;
            }
            
            .nav-btn {
                flex: 1;
                justify-content: center;
                padding: 8px 12px;
            }
            
            .time-badge {
                justify-content: center;
            }
            
            .tasks-grid,
            .history-tasks-grid {
                grid-template-columns: 1fr;
            }
        }

        .word-break {
            word-break: break-word;
            overflow-wrap: break-word;
        }

        .flex-row {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .w-100 {
            width: 100%;
        }
    </style>
</head>
<body>
    <div class="loader" id="loader">
        <div class="spinner"></div>
    </div>

    <div class="toast-container" id="toastContainer"></div>

    <div class="app-header">
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn <%= currentPage === 'tasks' ? 'active' : '' %>" onclick="switchPage('tasks')">
                    <i class="fas fa-tasks"></i>
                    <span>Tasks</span>
                </button>
                <button class="nav-btn <%= currentPage === 'notes' ? 'active' : '' %>" onclick="switchPage('notes')">
                    <i class="fas fa-note-sticky"></i>
                    <span>Notes</span>
                </button>
                <button class="nav-btn <%= currentPage === 'history' ? 'active' : '' %>" onclick="switchPage('history')">
                    <i class="fas fa-history"></i>
                    <span>History</span>
                </button>
            </div>
            <div class="time-badge">
                <i class="fas fa-calendar-alt"></i>
                <span id="currentDateDisplay"><%= currentDate %></span>
                <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>
            </div>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New">
        <i class="fas fa-plus"></i>
    </button>

    <div class="main-content" id="mainContent"></div>

    <!-- Add Task Modal -->
    <div class="modal" id="addTaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Create New Task</h2>
                <button class="action-btn" onclick="closeModal('addTaskModal')">&times;</button>
            </div>
            <form id="addTaskForm" onsubmit="submitTaskForm(event)">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Start Date</label>
                    <input type="date" class="form-control" name="startDate" id="startDate" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Start Time</label>
                        <input type="time" class="form-control" name="startTime" id="startTime" required>
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">End Time</label>
                        <input type="time" class="form-control" name="endTime" id="endTime" required>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat</label>
                    <select class="form-control" name="repeat" id="repeatSelect">
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>
                <div class="form-group" id="repeatCountGroup" style="margin-bottom: 12px; display: none;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat Count (1-365)</label>
                    <input type="number" class="form-control" name="repeatCount" value="7" min="1" max="365">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addTaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Create Task</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Task Modal -->
    <div class="modal" id="editTaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Task</h2>
                <button class="action-btn" onclick="closeModal('editTaskModal')">&times;</button>
            </div>
            <form id="editTaskForm" onsubmit="submitEditTaskForm(event)">
                <input type="hidden" name="taskId" id="editTaskId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editTitle" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" id="editDescription" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Start Date</label>
                    <input type="date" class="form-control" name="startDate" id="editStartDate" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Start Time</label>
                        <input type="time" class="form-control" name="startTime" id="editStartTime" required>
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">End Time</label>
                        <input type="time" class="form-control" name="endTime" id="editEndTime" required>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat</label>
                    <select class="form-control" name="repeat" id="editRepeatSelect">
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>
                <div class="form-group" id="editRepeatCountGroup" style="margin-bottom: 12px; display: none;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat Count (1-365)</label>
                    <input type="number" class="form-control" name="repeatCount" id="editRepeatCount" min="1" max="365">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editTaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Task</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Subtask Modal -->
    <div class="modal" id="addSubtaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Add Subtask</h2>
                <button class="action-btn" onclick="closeModal('addSubtaskModal')">&times;</button>
            </div>
            <form id="addSubtaskForm" onsubmit="submitSubtaskForm(event)">
                <input type="hidden" name="taskId" id="subtaskTaskId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addSubtaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Add Subtask</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Subtask Modal -->
    <div class="modal" id="editSubtaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Subtask</h2>
                <button class="action-btn" onclick="closeModal('editSubtaskModal')">&times;</button>
            </div>
            <form id="editSubtaskForm" onsubmit="submitEditSubtaskForm(event)">
                <input type="hidden" name="taskId" id="editSubtaskTaskId">
                <input type="hidden" name="subtaskId" id="editSubtaskId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editSubtaskTitle" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" id="editSubtaskDescription" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editSubtaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Subtask</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Note Modal -->
    <div class="modal" id="addNoteModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Create Note</h2>
                <button class="action-btn" onclick="closeModal('addNoteModal')">&times;</button>
            </div>
            <form id="addNoteForm" onsubmit="submitNoteForm(event)">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="200">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Content</label>
                    <textarea class="form-control" name="description" rows="4" placeholder="Enter note content (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addNoteModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Save Note</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Note Modal -->
    <div class="modal" id="editNoteModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Note</h2>
                <button class="action-btn" onclick="closeModal('editNoteModal')">&times;</button>
            </div>
            <form id="editNoteForm" onsubmit="submitEditNoteForm(event)">
                <input type="hidden" name="noteId" id="editNoteId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editNoteTitle" required maxlength="200">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Content</label>
                    <textarea class="form-control" name="description" id="editNoteDescription" rows="4" placeholder="Enter note content (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editNoteModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Note</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // ==========================================
        // TELEGRAM WEB APP INTEGRATION
        // ==========================================
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        // ==========================================
        // TOAST NOTIFICATION SYSTEM
        // ==========================================
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            if (type === 'error') toast.style.background = '#dc2626';
            else if (type === 'warning') toast.style.background = '#d97706';
            
            let icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
            
            toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // ==========================================
        // LOADER SYSTEM
        // ==========================================
        function showLoader() {
            document.getElementById('loader').style.display = 'flex';
        }

        function hideLoader() {
            document.getElementById('loader').style.display = 'none';
        }

        // ==========================================
        // PAGE SWITCHING
        // ==========================================
        let currentPage = '<%= currentPage %>';
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();

        function switchPage(page) {
            showLoader();
            fetch('/api/page/' + page)
                .then(res => res.json())
                .then(data => {
                    currentPage = page;
                    tasksData = data.tasks || [];
                    notesData = data.notes || [];
                    historyData = data.groupedHistory || {};
                    renderPage();
                    updateActiveNav();
                    hideLoader();
                })
                .catch(err => {
                    console.error(err);
                    showToast('Error loading page', 'error');
                    hideLoader();
                });
        }

        function updateActiveNav() {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(btn => {
                if (btn.innerText.toLowerCase().includes(currentPage)) {
                    btn.classList.add('active');
                }
            });
        }

        function renderPage() {
            const content = document.getElementById('mainContent');
            const fabButton = document.getElementById('fabButton');
            
            if (currentPage === 'tasks') {
                fabButton.style.display = 'flex';
                content.innerHTML = renderTasksPage();
            } else if (currentPage === 'notes') {
                fabButton.style.display = 'flex';
                content.innerHTML = renderNotesPage();
            } else if (currentPage === 'history') {
                fabButton.style.display = 'none';
                content.innerHTML = renderHistoryPage();
            }
        }

        // ==========================================
        // CONDITIONAL RENDERING HELPERS
        // ==========================================
        function hasContent(text) {
            return text && text.trim().length > 0;
        }

        function escapeHtml(text) {
            if (!text) return '';
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        function preserveLineBreaks(text) {
            if (!text) return '';
            return escapeHtml(text).replace(/\\n/g, '<br>');
        }

        // ==========================================
        // ESCAPE FOR JAVASCRIPT STRINGS - FIXES NEWLINES
        // ==========================================
        function escapeJsString(str) {
            if (!str) return '';
            return str
                .replace(/\\\\/g, '\\\\\\\\')
                .replace(/'/g, "\\\\'")
                .replace(/"/g, '\\\\"')
                .replace(/\\n/g, '\\\\n')
                .replace(/\\r/g, '\\\\r')
                .replace(/\\t/g, '\\\\t');
        }

        // ==========================================
        // TOGGLE DESCRIPTION VISIBILITY
        // ==========================================
        function toggleDescription(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                if (element.classList.contains('hidden')) {
                    element.classList.remove('hidden');
                } else {
                    element.classList.add('hidden');
                }
            }
        }

        // ==========================================
        // RENDER TASKS PAGE - COMPLETELY FIXED
        // ==========================================
        function renderTasksPage() {
            let html = \`
                <h1 class="page-title">Today's Tasks</h1>
                <div class="tasks-grid">
            \`;

            if (!tasksData || tasksData.length === 0) {
                html += \`
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <i class="fas fa-clipboard-list" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No tasks for today</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">Click the + button to add your first task!</p>
                    </div>
                \`;
            } else {
                tasksData.forEach((task, taskIndex) => {
                    const hasDescription = hasContent(task.description);
                    const progress = task.subtaskProgress || 0;
                    const circleCircumference = 2 * Math.PI * 16;
                    const circleOffset = circleCircumference - (progress / 100) * circleCircumference;
                    const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
                    const totalSubtasks = task.subtasks ? task.subtasks.length : 0;
                    const descriptionId = 'task_desc_' + task.taskId;
                    const escapedTitle = escapeHtml(task.title);
                    const escapedDescription = escapeJsString(task.description || '');
                    
                    html += \`
                        <div class="task-card">
                            <div class="task-header">
                                <div class="task-title-section">
                                    <div class="task-title-container" onclick="toggleDescription('\${descriptionId}')">
                                        <i class="fas fa-chevron-right" id="\${descriptionId}_icon"></i>
                                        <span class="task-title">\${escapedTitle}</span>
                                    </div>
                                </div>
                                <div class="task-actions">
                                    \${totalSubtasks < 10 ? \`
                                        <button class="action-btn" onclick="openAddSubtaskModal('\${task.taskId}')" title="Add Subtask">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    \` : ''}
                                    <button class="action-btn" onclick="openEditTaskModal('\${task.taskId}')" title="Edit Task">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button class="action-btn" onclick="completeTask('\${task.taskId}')" title="Complete Task">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    <button class="action-btn delete" onclick="deleteTask('\${task.taskId}')" title="Delete Task">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Description placed outside header, full width, fit-content -->
                            \${hasDescription ? \`
                                <div id="\${descriptionId}" class="task-description-container hidden">
                                    <div class="task-description">
                                        \${preserveLineBreaks(task.description)}
                                    </div>
                                </div>
                            \` : ''}

                            <!-- Date/Time row moved outside header, full width -->
                            <div class="task-time-row">
                                <span class="date-chip">
                                    <i class="fas fa-calendar-alt"></i> \${task.dateUTC}
                                </span>
                                <span class="time-chip">
                                    <i class="fas fa-clock"></i> \${task.startTimeUTC}-\${task.endTimeUTC}
                                </span>
                            </div>

                            \${totalSubtasks > 0 ? \`
                                <details class="task-subtasks">
                                    <summary class="flex-row" style="cursor: pointer;">
                                        <div class="progress-ring-small">
                                            <svg width="40" height="40">
                                                <circle class="progress-ring-circle-small" stroke="var(--progress-bg-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20"/>
                                                <circle class="progress-ring-circle-small" stroke="var(--accent-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20"
                                                    style="stroke-dasharray: \${circleCircumference}; stroke-dashoffset: \${circleOffset};"/>
                                            </svg>
                                            <span class="progress-text-small">\${progress}%</span>
                                        </div>
                                        <span style="font-size: 0.8rem; color: var(--text-secondary-light);">
                                            \${completedSubtasks}/\${totalSubtasks} subtasks
                                        </span>
                                    </summary>
                                    <div class="subtasks-container w-100">
                                        \${task.subtasks.sort((a, b) => {
                                            if (a.completed === b.completed) return 0;
                                            return a.completed ? 1 : -1;
                                        }).map((subtask, subtaskIndex) => {
                                            const subtaskHasDesc = hasContent(subtask.description);
                                            const subtaskDescId = 'subtask_desc_' + task.taskId + '_' + subtask.id;
                                            const escapedSubtaskTitle = escapeHtml(subtask.title);
                                            const escapedSubtaskDescription = escapeJsString(subtask.description || '');
                                            
                                            return \`
                                                <div class="subtask-item">
                                                    <div class="subtask-main-row">
                                                        <div class="subtask-checkbox \${subtask.completed ? 'completed' : ''}" onclick="toggleSubtask('\${task.taskId}', '\${subtask.id}')">
                                                            \${subtask.completed ? '<i class="fas fa-check"></i>' : ''}
                                                        </div>
                                                        <div class="subtask-details">
                                                            <div class="subtask-title-container" onclick="toggleDescription('\${subtaskDescId}')">
                                                                <span class="subtask-title \${subtask.completed ? 'completed' : ''}">
                                                                    \${escapedSubtaskTitle}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div class="subtask-actions">
                                                            <button class="subtask-btn" onclick="editSubtask('\${task.taskId}', '\${subtask.id}', '\${escapedSubtaskTitle.replace(/'/g, "\\\\'")}', '\${escapedSubtaskDescription.replace(/'/g, "\\\\'")}')">
                                                                <i class="fas fa-pencil-alt"></i>
                                                            </button>
                                                            <button class="subtask-btn delete" onclick="deleteSubtask('\${task.taskId}', '\${subtask.id}')">
                                                                <i class="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <!-- Subtask Description - NEW LINE, FULL WIDTH, FIT CONTENT -->
                                                    \${subtaskHasDesc ? \`
                                                        <div id="\${subtaskDescId}" class="subtask-description-container hidden">
                                                            <div class="subtask-description">
                                                                \${preserveLineBreaks(subtask.description)}
                                                            </div>
                                                        </div>
                                                    \` : ''}
                                                </div>
                                            \`;
                                        }).join('')}
                                    </div>
                                </details>
                            \` : \`
                                <div class="flex-row" style="margin-top: 8px;">
                                    <span style="font-size: 0.8rem; color: var(--text-secondary-light);">
                                        <i class="fas fa-tasks"></i> No subtasks
                                    </span>
                                </div>
                            \`}

                            <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                                <span class="badge">
                                    <i class="fas fa-repeat"></i> \${task.repeat && task.repeat !== 'none' ? (task.repeat === 'daily' ? 'Daily' : 'Weekly') : 'No Repeat'}
                                </span>
                                <span class="badge">
                                    <i class="fas fa-hourglass-half"></i> \${task.durationFormatted}
                                </span>
                                \${task.repeatCount > 0 ? \`
                                    <span class="badge">
                                        <i class="fas fa-hashtag"></i> \${task.repeatCount} left
                                    </span>
                                \` : ''}
                            </div>
                        </div>
                    \`;
                });
            }

            html += \`</div>\`;
            return html;
        }

        // ==========================================
        // RENDER NOTES PAGE - FIXED WITH FIT-CONTENT
        // ==========================================
        function renderNotesPage() {
            let html = \`
                <h1 class="page-title">Notes</h1>
                <div class="tasks-grid">
            \`;

            if (!notesData || notesData.length === 0) {
                html += \`
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <i class="fas fa-note-sticky" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No notes yet</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">Click the + button to create your first note!</p>
                    </div>
                \`;
            } else {
                notesData.forEach(note => {
                    const hasDescription = hasContent(note.description);
                    const noteDescId = 'note_desc_' + note.noteId;
                    const escapedNoteTitle = escapeHtml(note.title);
                    const escapedNoteDescription = escapeJsString(note.description || '');
                    
                    html += \`
                        <div class="note-card">
                            <div class="note-header">
                                <div class="task-title-container" onclick="toggleDescription('\${noteDescId}')">
                                    <i class="fas fa-chevron-right" id="\${noteDescId}_icon"></i>
                                    <span class="note-title">\${escapedNoteTitle}</span>
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <button class="action-btn" onclick="moveNote('\${note.noteId}', 'up')" title="Move Up">
                                        <i class="fas fa-arrow-up"></i>
                                    </button>
                                    <button class="action-btn" onclick="moveNote('\${note.noteId}', 'down')" title="Move Down">
                                        <i class="fas fa-arrow-down"></i>
                                    </button>
                                    <button class="action-btn" onclick="openEditNoteModal('\${note.noteId}', '\${escapedNoteTitle.replace(/'/g, "\\\\'")}', '\${escapedNoteDescription.replace(/'/g, "\\\\'")}')">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button class="action-btn delete" onclick="deleteNote('\${note.noteId}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Note Content - FIT CONTENT, REDUCED PADDING -->
                            \${hasDescription ? \`
                                <div id="\${noteDescId}" class="note-content-container hidden">
                                    <div class="note-content">
                                        \${preserveLineBreaks(note.description)}
                                    </div>
                                </div>
                            \` : ''}
                            
                            <div class="note-meta">
                                <span><i class="fas fa-clock"></i> \${note.createdAtUTC}</span>
                                \${note.updatedAtUTC !== note.createdAtUTC ? \`
                                    <span><i class="fas fa-pencil-alt"></i> \${note.updatedAtUTC}</span>
                                \` : ''}
                            </div>
                        </div>
                    \`;
                });
            }

            html += \`</div>\`;
            return html;
        }

        // ==========================================
        // RENDER HISTORY PAGE - FIXED
        // ==========================================
        function renderHistoryPage() {
            let html = \`
                <h1 class="page-title">Task History</h1>
                <div class="history-header">
                    <div class="month-selector">
                        <button class="month-btn" onclick="changeMonth(-1)">
                            <i class="fas fa-chevron-left"></i> Prev
                        </button>
                        <span style="font-weight: 600; font-size: 1rem;">
                            \${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} \${currentYear}
                        </span>
                        <button class="month-btn" onclick="changeMonth(1)">
                            Next <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
                <div class="history-grid">
            \`;

            const filteredHistory = filterHistoryByMonth(historyData, currentYear, currentMonth);
            const dates = Object.keys(filteredHistory).sort().reverse();

            if (dates.length === 0) {
                html += \`
                    <div class="empty-state">
                        <i class="fas fa-history" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No completed tasks</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">No tasks completed in this month</p>
                    </div>
                \`;
            } else {
                dates.forEach(date => {
                    const tasks = filteredHistory[date];
                    html += \`
                        <div class="history-date-card">
                            <details class="history-details">
                                <summary>
                                    <i class="fas fa-calendar-alt"></i>
                                    <span style="font-weight: 600;">\${date}</span>
                                    <span class="badge" style="margin-left: auto;">
                                        \${tasks.length} task\${tasks.length !== 1 ? 's' : ''}
                                    </span>
                                </summary>
                                <div class="history-tasks-grid">
                    \`;

                    tasks.forEach(task => {
                        const hasDescription = hasContent(task.description);
                        const historyDescId = 'history_desc_' + task._id;
                        const escapedHistoryTitle = escapeHtml(task.title);
                        
                        html += \`
                            <div class="history-task-card">
                                <div class="history-task-header">
                                    <div class="task-title-container" onclick="toggleDescription('\${historyDescId}')">
                                        <i class="fas fa-chevron-right"></i>
                                        <span class="history-task-title">\${escapedHistoryTitle}</span>
                                    </div>
                                    <span class="history-task-time">
                                        <i class="fas fa-check-circle" style="color: var(--success-light);"></i> \${task.completedTimeUTC}
                                    </span>
                                </div>
                                
                                <!-- History Description - FIT CONTENT -->
                                \${hasDescription ? \`
                                    <div id="\${historyDescId}" class="history-description-container hidden">
                                        <div class="history-description">
                                            \${preserveLineBreaks(task.description)}
                                        </div>
                                    </div>
                                \` : ''}
                                
                                <div style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;">
                                    <span class="badge">
                                        <i class="fas fa-clock"></i> \${task.startTimeUTC || formatTime(task.startDate)}-\${task.endTimeUTC || formatTime(task.endDate)}
                                    </span>
                                    <span class="badge">
                                        <i class="fas fa-hourglass-half"></i> \${task.durationFormatted}
                                    </span>
                                    \${task.repeat && task.repeat !== 'none' ? \`
                                        <span class="badge">
                                            <i class="fas fa-repeat"></i> \${task.repeat === 'daily' ? 'Daily' : 'Weekly'}
                                        </span>
                                    \` : ''}
                                </div>
                                \${task.subtasks && task.subtasks.length > 0 ? \`
                                    <details style="margin-top: 8px;">
                                        <summary style="cursor: pointer; color: var(--accent-light); font-weight: 600; font-size: 0.8rem;">
                                            <i class="fas fa-tasks"></i> Subtasks (\${task.subtasks.filter(s => s.completed).length}/\${task.subtasks.length})
                                        </summary>
                                        <div style="margin-top: 8px;">
                                            \${task.subtasks.map(subtask => {
                                                const subtaskHasDesc = hasContent(subtask.description);
                                                const historySubtaskDescId = 'history_subtask_desc_' + task._id + '_' + subtask.id;
                                                
                                                return \`
                                                    <div class="history-subtask">
                                                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                                                            <span style="color: \${subtask.completed ? 'var(--success-light)' : 'var(--text-secondary-light)'};">
                                                                <i class="fas fa-\${subtask.completed ? 'check-circle' : 'circle'}"></i>
                                                            </span>
                                                            <div style="flex: 1;">
                                                                <div class="task-title-container" onclick="toggleDescription('\${historySubtaskDescId}')">
                                                                    <span style="font-weight: 600; font-size: 0.8rem;">
                                                                        \${escapeHtml(subtask.title)}
                                                                    </span>
                                                                </div>
                                                                \${subtaskHasDesc ? \`
                                                                    <div id="\${historySubtaskDescId}" class="history-description-container hidden">
                                                                        <div class="history-description" style="border-left-color: var(--accent-light);">
                                                                            \${preserveLineBreaks(subtask.description)}
                                                                        </div>
                                                                    </div>
                                                                \` : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                \`;
                                            }).join('')}
                                        </div>
                                    </details>
                                \` : ''}
                            </div>
                        \`;
                    });

                    html += \`
                                </div>
                            </details>
                        </div>
                    \`;
                });
            }

            html += \`</div>\`;
            return html;
        }

        function filterHistoryByMonth(history, year, month) {
            const filtered = {};
            Object.keys(history).forEach(date => {
                const [day, monthNum, yearNum] = date.split('-').map(Number);
                if (yearNum === year && monthNum - 1 === month) {
                    filtered[date] = history[date];
                }
            });
            return filtered;
        }

        function changeMonth(delta) {
            currentMonth += delta;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            } else if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderPage();
        }

        function formatTime(dateString) {
            const date = new Date(dateString);
            return date.toISOString().split('T')[1].substring(0, 5);
        }

        // ==========================================
        // MODAL FUNCTIONS
        // ==========================================
        function openModal(modalId) {
            document.getElementById(modalId).style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function openAddModal() {
            if (currentPage === 'tasks') {
                openAddTaskModal();
            } else if (currentPage === 'notes') {
                openAddNoteModal();
            }
        }

        function openAddTaskModal() {
            const now = new Date();
            const year = now.getUTCFullYear();
            const month = String(now.getUTCMonth() + 1).padStart(2, '0');
            const day = String(now.getUTCDate()).padStart(2, '0');
            const hours = String(now.getUTCHours()).padStart(2, '0');
            const minutes = String(now.getUTCMinutes()).padStart(2, '0');
            
            document.getElementById('startDate').value = \`\${year}-\${month}-\${day}\`;
            document.getElementById('startTime').value = \`\${hours}:\${minutes}\`;
            
            const endHours = String(now.getUTCHours() + 1).padStart(2, '0');
            document.getElementById('endTime').value = \`\${endHours}:\${minutes}\`;
            
            openModal('addTaskModal');
        }

        function openEditTaskModal(taskId) {
            fetch('/api/tasks/' + taskId)
                .then(res => res.json())
                .then(task => {
                    document.getElementById('editTaskId').value = task.taskId;
                    document.getElementById('editTitle').value = task.title;
                    document.getElementById('editDescription').value = task.description || '';
                    
                    const startDate = new Date(task.startDate);
                    const year = startDate.getUTCFullYear();
                    const month = String(startDate.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(startDate.getUTCDate()).padStart(2, '0');
                    document.getElementById('editStartDate').value = \`\${year}-\${month}-\${day}\`;
                    
                    const startHours = String(startDate.getUTCHours()).padStart(2, '0');
                    const startMinutes = String(startDate.getUTCMinutes()).padStart(2, '0');
                    document.getElementById('editStartTime').value = \`\${startHours}:\${startMinutes}\`;
                    
                    const endDate = new Date(task.endDate);
                    const endHours = String(endDate.getUTCHours()).padStart(2, '0');
                    const endMinutes = String(endDate.getUTCMinutes()).padStart(2, '0');
                    document.getElementById('editEndTime').value = \`\${endHours}:\${endMinutes}\`;
                    
                    document.getElementById('editRepeatSelect').value = task.repeat || 'none';
                    document.getElementById('editRepeatCount').value = task.repeatCount || 7;
                    document.getElementById('editRepeatCountGroup').style.display = 
                        task.repeat !== 'none' ? 'block' : 'none';
                    
                    openModal('editTaskModal');
                })
                .catch(err => {
                    console.error(err);
                    showToast('Error loading task details', 'error');
                });
        }

        function openAddSubtaskModal(taskId) {
            document.getElementById('subtaskTaskId').value = taskId;
            openModal('addSubtaskModal');
        }

        function editSubtask(taskId, subtaskId, title, description) {
            document.getElementById('editSubtaskTaskId').value = taskId;
            document.getElementById('editSubtaskId').value = subtaskId;
            document.getElementById('editSubtaskTitle').value = title;
            document.getElementById('editSubtaskDescription').value = description || '';
            openModal('editSubtaskModal');
        }

        function openAddNoteModal() {
            openModal('addNoteModal');
        }

        function openEditNoteModal(noteId, title, description) {
            document.getElementById('editNoteId').value = noteId;
            document.getElementById('editNoteTitle').value = title;
            document.getElementById('editNoteDescription').value = description || '';
            openModal('editNoteModal');
        }

        // ==========================================
        // FORM SUBMISSIONS
        // ==========================================
        function submitTaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            
            fetch('/api/tasks', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addTaskModal');
                    showToast('Task created successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error creating task: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditTaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const taskId = formData.get('taskId');
            
            fetch('/api/tasks/' + taskId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editTaskModal');
                    showToast('Task updated successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating task: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitSubtaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const taskId = formData.get('taskId');
            
            fetch('/api/tasks/' + taskId + '/subtasks', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addSubtaskModal');
                    showToast('Subtask added successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error adding subtask: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditSubtaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const taskId = formData.get('taskId');
            const subtaskId = formData.get('subtaskId');
            
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editSubtaskModal');
                    showToast('Subtask updated successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating subtask: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitNoteForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            
            fetch('/api/notes', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addNoteModal');
                    showToast('Note created successfully!');
                    switchPage('notes');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error creating note: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditNoteForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const noteId = formData.get('noteId');
            
            fetch('/api/notes/' + noteId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editNoteModal');
                    showToast('Note updated successfully!');
                    switchPage('notes');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating note: ' + err.message, 'error');
                hideLoader();
            });
        }

        // ==========================================
        // ACTION FUNCTIONS
        // ==========================================
        function toggleSubtask(taskId, subtaskId) {
            showLoader();
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/toggle', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Subtask toggled');
                    switchPage('tasks');
                } else {
                    throw new Error('Failed to toggle subtask');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error toggling subtask', 'error');
                hideLoader();
            });
        }

        function deleteSubtask(taskId, subtaskId) {
            if (!confirm('Delete this subtask?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Subtask deleted');
                    switchPage('tasks');
                } else {
                    throw new Error('Failed to delete subtask');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting subtask', 'error');
                hideLoader();
            });
        }

        function completeTask(taskId) {
            if (!confirm('Complete this task?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/complete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Task completed!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error completing task: ' + err.message, 'error');
                hideLoader();
            });
        }

        function deleteTask(taskId) {
            if (!confirm('Delete this task? This will affect all users!')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Task deleted');
                    switchPage('tasks');
                } else {
                    throw new Error('Failed to delete task');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting task', 'error');
                hideLoader();
            });
        }

        function deleteNote(noteId) {
            if (!confirm('Delete this note? This will affect all users!')) return;
            showLoader();
            fetch('/api/notes/' + noteId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Note deleted');
                    switchPage('notes');
                } else {
                    throw new Error('Failed to delete note');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting note', 'error');
                hideLoader();
            });
        }

        function moveNote(noteId, direction) {
            showLoader();
            const formData = new FormData();
            formData.append('direction', direction);
            
            fetch('/api/notes/' + noteId + '/move', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    showToast('Note moved');
                    switchPage('notes');
                } else {
                    throw new Error('Failed to move note');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error moving note', 'error');
                hideLoader();
            });
        }

        // ==========================================
        // INITIALIZATION
        // ==========================================
        document.addEventListener('DOMContentLoaded', function() {
            renderPage();
            updateActiveNav();
            
            setInterval(() => {
                const now = new Date();
                const hours = String(now.getUTCHours()).padStart(2, '0');
                const minutes = String(now.getUTCMinutes()).padStart(2, '0');
                const day = String(now.getUTCDate()).padStart(2, '0');
                const month = String(now.getUTCMonth() + 1).padStart(2, '0');
                const year = now.getUTCFullYear();
                document.getElementById('currentTimeDisplay').innerHTML = \`\${hours}:\${minutes}\`;
                document.getElementById('currentDateDisplay').innerHTML = \`\${day}-\${month}-\${year}\`;
            }, 1000);
            
            document.getElementById('repeatSelect').addEventListener('change', function() {
                document.getElementById('repeatCountGroup').style.display = 
                    this.value === 'none' ? 'none' : 'block';
            });
            
            document.getElementById('editRepeatSelect').addEventListener('change', function() {
                document.getElementById('editRepeatCountGroup').style.display = 
                    this.value === 'none' ? 'none' : 'block';
            });
            
            window.addEventListener('click', function(event) {
                if (event.target.classList.contains('modal')) {
                    event.target.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            });
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), mainEJS);
    console.log('✅ EJS template file created successfully with all fixes');
}

writeMainEJS();

// ==========================================
// 🗄️ DATABASE CONNECTION
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
            console.error('❌ MongoDB Connection Error (' + retries + ' retries left):', error.message);
            if (retries === 0) {
                console.error('❌ Failed to connect to MongoDB after multiple attempts');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        time: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================
function generateId(type = 'task') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const length = type === 'task' ? 10 : 8;
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateSubtaskId() {
    return 'sub_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

async function reindexNotes() {
    try {
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1 })
            .toArray();
        
        for (let i = 0; i < notes.length; i++) {
            await db.collection('notes').updateOne(
                { noteId: notes[i].noteId },
                { $set: { orderIndex: i } }
            );
        }
        console.log('✅ Notes reindexed successfully');
    } catch (error) {
        console.error('❌ Error reindexing notes:', error.message);
    }
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

function hasContent(text) {
    return text && text.trim().length > 0;
}

function formatBlockquote(text) {
    if (!hasContent(text)) return '';
    const words = text.split(/\s+/).length;
    if (words > 100 || text.split('\n').length > 4) {
        return '<blockquote expandable>' + text + '</blockquote>';
    }
    return '<blockquote>' + text + '</blockquote>';
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
    if (hours === 0) return mins + ' min' + (mins !== 1 ? 's' : '');
    if (mins === 0) return hours + ' hour' + (hours !== 1 ? 's' : '');
    return hours + ' hour' + (hours !== 1 ? 's' : '') + ' ' + mins + ' min' + (mins !== 1 ? 's' : '');
}

function formatDateUTC(utcDate) {
    const date = new Date(utcDate);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return day + '-' + month + '-' + year;
}

function formatTimeUTC(utcDate) {
    const date = new Date(utcDate);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
}

function formatDateTimeUTC(utcDate) {
    return formatDateUTC(utcDate) + ' at ' + formatTimeUTC(utcDate);
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

        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);
        if (startTime <= tenMinutesFromNow) {
            console.log('⏰ Not scheduling task ' + task.title + ' - start time is within 10 minutes or in past');
            return;
        }

        const notifyTime = new Date(startTime.getTime() - 10 * 60000);
        const triggerDate = notifyTime > now ? notifyTime : now;

        console.log('⏰ Scheduled: ' + task.title + ' for ' + formatDateTimeUTC(startTime));

        const startJob = schedule.scheduleJob(triggerDate, async function() {
            if (isShuttingDown) return;
            
            console.log('🔔 Starting notifications for task: ' + task.title);
            
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
                                '🚀 <b>𝙏𝘼𝙎𝙆 𝙎𝙏𝘼𝙍𝙏𝙀𝘿 𝙉𝙊𝙒!</b>\n' +
                                '📌 <b>Title: ' + task.title + '</b>\n\n' +
                                'Time to work! ⏰', 
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
                        '🔔 <b>𝗥𝗘𝗠𝗜𝗡𝗗𝗘𝗥 (' + (count + 1) + '/' + maxNotifications + ')</b>\n' +
                        '━━━━━━━━━━━━━━━━━━━━\n' +
                        '📌 <b>' + task.title + '</b>\n' +
                        '⏳ Starts in: <b>' + minutesLeft + ' minute' + (minutesLeft !== 1 ? 's' : '') + '</b>\n' +
                        '⏰ Start Time: ' + formatTimeUTC(startTime) + '\n' +
                        '📅 Date: ' + formatDateUTC(startTime) + '\n' +
                        '━━━━━━━━━━━━━━━━━━━━', 
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
        console.error('❌ Scheduler Error for task ' + (task?.taskId || 'unknown') + ':', error.message);
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
        console.log('🗑️ Cleared schedules for task ' + taskId);
    }
}

async function rescheduleAllPending() {
    try {
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
        const tasks = await db.collection('tasks').find({ 
            status: 'pending',
            startDate: { $gt: tenMinutesFromNow }
        }).toArray();
        
        console.log('🔄 Rescheduling ' + tasks.length + ' pending tasks...');
        tasks.forEach(task => scheduleTask(task));
        console.log('✅ Rescheduled ' + tasks.length + ' tasks.');
    } catch (error) {
        console.error('❌ Error rescheduling tasks:', error.message);
    }
}

// ==========================================
// ⏰ AUTO-COMPLETE PENDING TASKS AT 23:59 UTC
// ==========================================
async function autoCompletePendingTasks() {
    console.log('⏰ Running auto-complete for pending tasks at 23:59...');
    
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
        
        console.log('📋 Found ' + pendingTasks.length + ' pending tasks to auto-complete');
        
        for (const task of pendingTasks) {
            await autoCompleteTask(task);
        }
        
        console.log('✅ Auto-completed ' + pendingTasks.length + ' tasks');
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
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
            if (updatedTask && updatedTask.nextOccurrence > tenMinutesFromNow) {
                scheduleTask(updatedTask);
            }
        } else {
            await db.collection('tasks').deleteOne({ taskId });
        }
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '⏰ <b>𝗔𝗨𝗧𝗢-𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + task.title + '</b>\n' +
                '✅ Automatically completed at 23:59\n' +
                '📅 ' + formatDateUTC(completedAtUTC) + '\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.error('Error sending auto-complete notification:', e.message);
        }
        
    } catch (error) {
        console.error('Error auto-completing task ' + task.taskId + ':', error.message);
    }
}

function scheduleAutoComplete() {
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
    }
    
    autoCompleteJob = schedule.scheduleJob('59 23 * * *', async () => {
        if (!isShuttingDown) await autoCompletePendingTasks();
    });
    
    console.log('✅ Auto-complete scheduler started (23:59 daily)');
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => {
    res.redirect('/tasks');
});

app.get('/tasks', async (req, res) => {
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const tasks = await db.collection('tasks').find({
            status: 'pending',
            nextOccurrence: {
                $gte: todayUTC,
                $lt: tomorrowUTC
            }
        }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
        
        console.log('📊 Tasks found: ' + tasks.length);
        
        res.render('index', {
            currentPage: 'tasks',
            tasks: tasks.map(task => ({
                ...task,
                taskId: task.taskId,
                startTimeUTC: formatTimeUTC(task.startDate),
                endTimeUTC: formatTimeUTC(task.endDate),
                dateUTC: formatDateUTC(task.startDate),
                duration: calculateDuration(task.startDate, task.endDate),
                durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)),
                subtaskProgress: calculateSubtaskProgress(task.subtasks),
                subtasks: task.subtasks || []
            })),
            notes: [],
            groupedHistory: {},
            currentTime: formatTimeUTC(new Date()),
            currentDate: formatDateUTC(new Date()),
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
        res.status(500).send('Error loading tasks: ' + error.message);
    }
});

app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        console.log('📝 Notes found: ' + notes.length);
        
        res.render('index', {
            currentPage: 'notes',
            tasks: [],
            notes: notes.map(note => ({
                ...note,
                noteId: note.noteId,
                createdAtUTC: formatDateTimeUTC(note.createdAt),
                updatedAtUTC: note.updatedAt ? formatDateTimeUTC(note.updatedAt) : formatDateTimeUTC(note.createdAt)
            })),
            groupedHistory: {},
            currentTime: formatTimeUTC(new Date()),
            currentDate: formatDateUTC(new Date()),
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading notes:', error);
        res.status(500).send('Error loading notes: ' + error.message);
    }
});

app.get('/history', async (req, res) => {
    try {
        const history = await db.collection('history').find()
            .sort({ completedAt: -1 })
            .limit(500)
            .toArray();
        
        const groupedHistory = {};
        history.forEach(item => {
            const dateKey = formatDateUTC(item.completedAt);
            if (!groupedHistory[dateKey]) {
                groupedHistory[dateKey] = [];
            }
            groupedHistory[dateKey].push({
                ...item,
                completedTimeUTC: formatTimeUTC(item.completedAt),
                startTimeUTC: formatTimeUTC(item.startDate),
                endTimeUTC: formatTimeUTC(item.endDate),
                durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate))
            });
        });
        
        console.log('📜 History entries: ' + history.length);
        
        res.render('index', {
            currentPage: 'history',
            tasks: [],
            notes: [],
            groupedHistory: groupedHistory,
            currentTime: formatTimeUTC(new Date()),
            currentDate: formatDateUTC(new Date()),
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading history:', error);
        res.status(500).send('Error loading history: ' + error.message);
    }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        
        if (page === 'tasks') {
            const todayUTC = getTodayUTC();
            const tomorrowUTC = getTomorrowUTC();
            
            const tasks = await db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            
            res.json({
                tasks: tasks.map(task => ({
                    ...task,
                    taskId: task.taskId,
                    startTimeUTC: formatTimeUTC(task.startDate),
                    endTimeUTC: formatTimeUTC(task.endDate),
                    dateUTC: formatDateUTC(task.startDate),
                    duration: calculateDuration(task.startDate, task.endDate),
                    durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)),
                    subtaskProgress: calculateSubtaskProgress(task.subtasks),
                    subtasks: task.subtasks || []
                })),
                notes: [],
                groupedHistory: {}
            });
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find()
                .sort({ orderIndex: 1, createdAt: -1 })
                .toArray();
            
            res.json({
                tasks: [],
                notes: notes.map(note => ({
                    ...note,
                    noteId: note.noteId,
                    createdAtUTC: formatDateTimeUTC(note.createdAt),
                    updatedAtUTC: note.updatedAt ? formatDateTimeUTC(note.updatedAt) : formatDateTimeUTC(note.createdAt)
                })),
                groupedHistory: {}
            });
        } else if (page === 'history') {
            const history = await db.collection('history').find()
                .sort({ completedAt: -1 })
                .limit(500)
                .toArray();
            
            const groupedHistory = {};
            history.forEach(item => {
                const dateKey = formatDateUTC(item.completedAt);
                if (!groupedHistory[dateKey]) {
                    groupedHistory[dateKey] = [];
                }
                groupedHistory[dateKey].push({
                    ...item,
                    completedTimeUTC: formatTimeUTC(item.completedAt),
                    startTimeUTC: formatTimeUTC(item.startDate),
                    endTimeUTC: formatTimeUTC(item.endDate),
                    durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate))
                });
            });
            
            res.json({
                tasks: [],
                notes: [],
                groupedHistory
            });
        } else {
            res.status(404).json({ error: 'Page not found' });
        }
    } catch (error) {
        console.error('Error in /api/page:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tasks/:taskId', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const task = await db.collection('tasks').findOne({ taskId });
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        res.json({
            ...task,
            taskId: task.taskId,
            startTimeUTC: formatTimeUTC(task.startDate),
            endTimeUTC: formatTimeUTC(task.endDate),
            dateUTC: formatDateUTC(task.startDate)
        });
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        
        if (!title || !startDate || !startTime || !endTime) {
            return res.status(400).send('Missing required fields');
        }
        
        const [year, month, day] = startDate.split('-').map(Number);
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        
        const startDateUTC = new Date(Date.UTC(year, month - 1, day, startHour, startMinute, 0));
        const endDateUTC = new Date(Date.UTC(year, month - 1, day, endHour, endMinute, 0));
        
        if (endDateUTC <= startDateUTC) {
            return res.status(400).send('End time must be after start time');
        }
        
        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);
        
        if (startDateUTC <= tenMinutesFromNow) {
            return res.status(400).send('Start time must be at least 10 minutes from now');
        }
        
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        const task = {
            taskId: generateId('task'),
            title: title.trim(),
            description: description ? description.trim() : '',
            startDate: startDateUTC,
            endDate: endDateUTC,
            nextOccurrence: startDateUTC,
            status: 'pending',
            repeat: repeat || 'none',
            repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0,
            subtasks: [],
            createdAt: new Date(),
            orderIndex: nextOrderIndex,
            startTimeStr: startTime,
            endTimeStr: endTime
        };
        
        await db.collection('tasks').insertOne(task);
        console.log('✅ Task created: ' + task.title + ' (' + task.taskId + ')');
        
        if (task.startDate > tenMinutesFromNow) {
            scheduleTask(task);
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Error creating task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const [year, month, day] = startDate.split('-').map(Number);
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        
        if (startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
            endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
            return res.status(400).send('Time must be between 00:00 and 23:59');
        }
        
        const startDateUTC = new Date(Date.UTC(year, month - 1, day, startHour, startMinute, 0));
        const endDateUTC = new Date(Date.UTC(year, month - 1, day, endHour, endMinute, 0));
        
        if (endDateUTC <= startDateUTC) {
            return res.status(400).send('End time must be after start time');
        }
        
        cancelTaskSchedule(taskId);
        
        await db.collection('tasks').updateOne(
            { taskId },
            {
                $set: {
                    title: title.trim(),
                    description: description ? description.trim() : '',
                    startDate: startDateUTC,
                    endDate: endDateUTC,
                    nextOccurrence: startDateUTC,
                    repeat: repeat || 'none',
                    repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0,
                    startTimeStr: startTime,
                    endTimeStr: endTime,
                    updatedAt: new Date()
                }
            }
        );
        
        const updatedTask = await db.collection('tasks').findOne({ taskId });
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
        if (updatedTask && updatedTask.startDate > tenMinutesFromNow) {
            scheduleTask(updatedTask);
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).send('Error updating task: ' + error.message);
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
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
            if (updatedTask && updatedTask.nextOccurrence > tenMinutesFromNow) {
                scheduleTask(updatedTask);
            }
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '🔄 Next occurrence: ' + formatDateUTC(nextOccurrence) + '\n' +
                    '📊 Remaining repeats: ' + (task.repeatCount - 1) + '\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '📅 Completed at: ' + formatDateTimeUTC(completedAtUTC) + '\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
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
        
        console.log('🗑️ Task deleted: ' + taskId);
        
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
            id: generateSubtaskId(),
            title: title.trim(),
            description: description ? description.trim() : '',
            completed: false,
            createdAt: new Date()
        };
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $push: { subtasks: subtask } }
        );
        
        console.log('➕ Subtask added to ' + task.title + ': ' + subtask.title);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error adding subtask:', error);
        res.status(500).send('Error adding subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/update', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Subtask title cannot be empty');
        }
        
        const result = await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { 
                $set: { 
                    "subtasks.$.title": title.trim(),
                    "subtasks.$.description": description ? description.trim() : '',
                    "subtasks.$.updatedAt": new Date()
                } 
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Task or subtask not found');
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error updating subtask:', error);
        res.status(500).send('Error updating subtask: ' + error.message);
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
        
        const result = await db.collection('tasks').updateOne(
            { taskId },
            { $pull: { subtasks: { id: subtaskId } } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Task not found');
        }
        
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
            noteId: generateId('note'),
            title: title.trim(),
            description: description ? description.trim() : '',
            createdAt: new Date(),
            updatedAt: new Date(),
            orderIndex: nextOrderIndex
        };
        
        await db.collection('notes').insertOne(note);
        
        console.log('📝 Note created: ' + note.title + ' (' + note.noteId + ')');
        
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
        
        const result = await db.collection('notes').updateOne(
            { noteId },
            { 
                $set: { 
                    title: title.trim(), 
                    description: description ? description.trim() : '',
                    updatedAt: new Date() 
                } 
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Note not found');
        }
        
        console.log('✏️ Note updated: ' + noteId);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send('Error updating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        
        const result = await db.collection('notes').deleteOne({ noteId });
        
        if (result.deletedCount === 0) {
            return res.status(404).send('Note not found');
        }
        
        console.log('🗑️ Note deleted: ' + noteId);
        
        await reindexNotes();
        
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
// 🤖 BOT COMMANDS - FIXED SUBTASK HANDLING WITH LAZY REGEX
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
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

bot.use((ctx, next) => {
    if (ctx.from && ctx.from.id.toString() === CHAT_ID.toString()) {
        return next();
    }
    return;
});

bot.command('start', async (ctx) => {
    ctx.session = {};
    
    const now = new Date();
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${formatTimeUTC(now)}
📅 Today: ${formatDateUTC(now)}

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
    const now = new Date();
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${formatTimeUTC(now)}
📅 Today: ${formatDateUTC(now)}

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
📋 <b>𝗧𝗢𝗗𝗔𝗬\'S 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDateUTC(todayUTC)}
📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}
📄 Page: ${page}/${totalPages}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬\'S 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

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
            taskTitle += ' [' + progress + '%]';
        }
        
        if (taskTitle.length > 30) {
            taskTitle = taskTitle.substring(0, 27) + '...';
        }
        
        buttons.push([
            Markup.button.callback(
                taskNum + '. ' + taskTitle, 
                'task_det_' + t.taskId
            )
        ]);
    });

    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Back', 'view_today_tasks_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'view_today_tasks_' + (page + 1)));
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
// ➕ ADD TASK WIZARD
// ==========================================
bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateId('task'), 
        status: 'pending',
        createdAt: new Date(),
        subtasks: []
    };
    
    const text = '🎯 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task (max 100 characters):';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId('note'), 
        createdAt: new Date()
    };
    
    const text = '📝 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note (max 200 characters):';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 📨 TEXT INPUT HANDLER
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
                '📄 <b>𝗘𝗡𝗧𝗘𝗥 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📝 <i>Describe your task (Max 100 words):</i>\n' +
                'Enter "-" for no description',
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
                '📅 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗔𝗧𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📆 Today: ' + formatDateUTC(new Date()) + '\n' +
                '📝 <i>Enter the date (DD-MM-YYYY):</i>',
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
                '⏰ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🕒 Current Time: ' + formatTimeUTC(new Date()) + '\n' +
                '📝 <i>Enter start time in HH:MM (24-hour):</i>',
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
            const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);
            
            if (startDateUTC <= tenMinutesFromNow) {
                return ctx.reply('❌ Start time must be at least 10 minutes from now. Please enter a future time.');
            }
            
            ctx.session.task.startDate = startDateUTC;
            ctx.session.task.startTimeStr = text;
            ctx.session.task.nextOccurrence = startDateUTC;
            ctx.session.step = 'task_end';
            
            await ctx.reply(
                '⏱️ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '⏰ Start Time: ' + text + '\n' +
                '📝 <i>Enter end time in HH:MM format (24-hour):</i>',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_end') {
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
            }
            
            const [eh, em] = text.split(':').map(Number);
            const { year, month, day } = ctx.session.task;
            const endDateUTC = new Date(Date.UTC(year, month - 1, day, eh, em, 0));
            
            if (endDateUTC <= ctx.session.task.startDate) {
                return ctx.reply('❌ End time must be after Start time.');
            }
            
            ctx.session.task.endDate = endDateUTC;
            ctx.session.task.endTimeStr = text;
            ctx.session.step = null;

            const duration = calculateDuration(ctx.session.task.startDate, endDateUTC);
            
            await ctx.reply(
                '🔄 <b>𝗥𝗘𝗣𝗘𝗔𝗧 𝗢𝗣𝗧𝗜𝗢𝗡𝗦</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'How should this task repeat?\n\n' +
                '📅 Task Date: ' + formatDateUTC(ctx.session.task.startDate) + '\n' +
                '⏰ Time: ' + ctx.session.task.startTimeStr + ' - ' + text + '\n' +
                '⏱️ Duration: ' + formatDuration(duration) + '\n\n',
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
                '📝 <b>𝗘𝗡𝗧𝗘𝗥 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📝 <i>Enter note content (Max 400 words)</i>\n' +
                'Enter "-" for empty content',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'note_content') {
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Keep it under 400 words.');
            }
            
            ctx.session.note.description = content;
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
                const noteContent = ctx.session.note.description;
                
                await db.collection('notes').insertOne(ctx.session.note);
                
                ctx.session.step = null;
                delete ctx.session.note;
                
                await ctx.reply(
                    '✅ <b>𝗡𝗢𝗧𝗘 𝗦𝗔𝗩𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + noteTitle + '</b>\n' +
                    (hasContent(noteContent) ? formatBlockquote(noteContent) : '') + '\n' +
                    '📅 Saved on: ' + formatDateTimeUTC(new Date()),
                    { parse_mode: 'HTML' }
                );
                
                await showMainMenu(ctx);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        '📝 <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗔𝗗𝗗𝗘𝗗</b>\n' +
                        '━━━━━━━━━━━━━━━━━━━━\n' +
                        '📌 <b>' + noteTitle + '</b>\n' +
                        (hasContent(noteContent) ? formatBlockquote(noteContent) : '') + '\n' +
                        '📅 ' + formatDateTimeUTC(new Date()) + '\n' +
                        '━━━━━━━━━━━━━━━━━━━━',
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
                
            } catch (error) {
                console.error('Error saving note:', error);
                await ctx.reply('❌ Failed to save note. Please try again.');
            }
        }
        else if (step === 'add_subtask') {
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
            
            ctx.session.subtaskTitle = text;
            ctx.session.step = 'add_subtask_desc';
            
            await ctx.reply(
                '📝 <b>𝗔𝗗𝗗 𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'Title: ' + text + '\n\n' +
                'Enter description (or "-" for none):',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'add_subtask_desc') {
            const taskId = ctx.session.addSubtasksTaskId;
            const title = ctx.session.subtaskTitle;
            const description = text === '-' ? '' : text;
            
            const task = await db.collection('tasks').findOne({ taskId });
            
            if (!task) {
                ctx.session.step = null;
                delete ctx.session.addSubtasksTaskId;
                delete ctx.session.subtaskTitle;
                return ctx.reply('❌ Task not found.');
            }
            
            const newSubtask = {
                id: generateSubtaskId(),
                title: title.substring(0, 100),
                description: description,
                completed: false,
                createdAt: new Date()
            };
            
            await db.collection('tasks').updateOne(
                { taskId },
                { $push: { subtasks: newSubtask } }
            );
            
            ctx.session.step = null;
            delete ctx.session.addSubtasksTaskId;
            delete ctx.session.subtaskTitle;
            
            await ctx.reply(
                '✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗔𝗗𝗗𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + task.title + '</b>\n' +
                '➕ Title: ' + title + '\n' +
                (hasContent(description) ? '📝 Description: ' + description + '\n' : '') +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
            
            await showTaskDetail(ctx, taskId);
        }
        else if (step === 'edit_subtask_title') {
            const { taskId, subtaskId } = ctx.session.editSubtask;
            
            if (!taskId || !subtaskId) {
                ctx.session.step = null;
                return ctx.reply('❌ Invalid session data.');
            }
            
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            ctx.session.editSubtaskTitle = text;
            ctx.session.step = 'edit_subtask_desc';
            
            await ctx.reply(
                '✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'New title: ' + text + '\n\n' +
                'Enter new description (or "-" for none):',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'edit_subtask_desc') {
            const { taskId, subtaskId } = ctx.session.editSubtask;
            const title = ctx.session.editSubtaskTitle;
            const description = text === '-' ? '' : text;
            
            if (!taskId || !subtaskId) {
                ctx.session.step = null;
                return ctx.reply('❌ Invalid session data.');
            }
            
            const task = await db.collection('tasks').findOne({ taskId });
            if (!task) {
                ctx.session.step = null;
                delete ctx.session.editSubtask;
                return ctx.reply('❌ Task not found.');
            }
            
            await db.collection('tasks').updateOne(
                { taskId, "subtasks.id": subtaskId },
                { 
                    $set: { 
                        "subtasks.$.title": title,
                        "subtasks.$.description": description,
                        "subtasks.$.updatedAt": new Date()
                    } 
                }
            );
            
            ctx.session.step = null;
            delete ctx.session.editSubtask;
            delete ctx.session.editSubtaskTitle;
            
            await ctx.reply('✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>', { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        }
        else if (step === 'edit_task_title') {
            const taskId = ctx.session.editTaskId;
            if (!taskId) {
                ctx.session.step = null;
                return ctx.reply('❌ No task selected.');
            }
            
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
                await ctx.reply('✅ <b>TITLE UPDATED!</b>', { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        '✏️ <b>𝗧𝗔𝗦𝗞 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗</b>\n' +
                        '━━━━━━━━━━━━━━━━━━━━\n' +
                        '📌 New Title: <b>' + text + '</b>\n' +
                        '━━━━━━━━━━━━━━━━━━━━',
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
            if (!taskId) {
                ctx.session.step = null;
                return ctx.reply('❌ No task selected.');
            }
            
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
                await ctx.reply('✅ <b>DESCRIPTION UPDATED!</b>', { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating description:', error);
                await ctx.reply('❌ Failed to update description.');
            }
        }
        else if (step === 'edit_task_start') {
            const taskId = ctx.session.editTaskId;
            if (!taskId) {
                ctx.session.step = null;
                return ctx.reply('❌ No task selected.');
            }
            
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid Format. Use HH:MM (24-hour)');
            }
            
            const [h, m] = text.split(':').map(Number);
            
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
                    const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
                    if (updatedTask.nextOccurrence > tenMinutesFromNow) {
                        scheduleTask(updatedTask);
                    }
                }
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply('✅ <b>START TIME UPDATED!</b>\n\nEnd time adjusted to: ' + formatTimeUTC(newEndDateUTC), { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating start time:', error);
                await ctx.reply('❌ Failed to update start time.');
            }
        }
        else if (step === 'edit_task_end') {
            const taskId = ctx.session.editTaskId;
            if (!taskId) {
                ctx.session.step = null;
                return ctx.reply('❌ No task selected.');
            }
            
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid Format. Use HH:MM (24-hour)');
            }
            
            const [eh, em] = text.split(':').map(Number);
            
            if (eh < 0 || eh > 23 || em < 0 || em > 59) {
                return ctx.reply('❌ Time must be between 00:00 and 23:59');
            }
            
            try {
                const task = await db.collection('tasks').findOne({ taskId });
                if (!task) {
                    ctx.session.step = null;
                    delete ctx.session.editTaskId;
                    return ctx.reply('❌ Task not found.');
                }
                
                const utcDate = new Date(task.endDate);
                const year = utcDate.getUTCFullYear();
                const month = utcDate.getUTCMonth();
                const day = utcDate.getUTCDate();
                
                const newEndDateUTC = new Date(Date.UTC(year, month, day, eh, em, 0));
                
                if (newEndDateUTC <= task.startDate) {
                    return ctx.reply('❌ End time must be after start time.');
                }
                
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { 
                        $set: { 
                            endDate: newEndDateUTC,
                            endTimeStr: text
                        } 
                    }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { endDate: newEndDateUTC } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply('✅ <b>END TIME UPDATED!</b>', { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating end time:', error);
                await ctx.reply('❌ Failed to update end time.');
            }
        }
        else if (step === 'edit_task_repeat_count') {
            const taskId = ctx.session.editTaskId;
            if (!taskId) {
                ctx.session.step = null;
                return ctx.reply('❌ No task selected.');
            }
            
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
                await ctx.reply('✅ <b>REPEAT COUNT UPDATED!</b>', { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating repeat count:', error);
                await ctx.reply('❌ Failed to update repeat count.');
            }
        }
        else if (step === 'edit_note_title') {
            const noteId = ctx.session.editNoteId;
            if (!noteId) {
                ctx.session.step = null;
                return ctx.reply('❌ No note selected.');
            }
            
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
                    '✅ <b>𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + updatedNote.title + '</b>\n' +
                    (hasContent(updatedNote.description) ? formatBlockquote(updatedNote.description) : '') + '\n' +
                    '📅 Updated: ' + formatDateTimeUTC(new Date()),
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
            if (!noteId) {
                ctx.session.step = null;
                return ctx.reply('❌ No note selected.');
            }
            
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Max 400 words.');
            }
            
            try {
                await db.collection('notes').updateOne(
                    { noteId: noteId }, 
                    { $set: { description: content, updatedAt: new Date() } }
                );
                
                const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
                
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                
                await ctx.reply(
                    '✅ <b>𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + updatedNote.title + '</b>\n' +
                    (hasContent(updatedNote.description) ? formatBlockquote(updatedNote.description) : '') + '\n' +
                    '📅 Updated: ' + formatDateTimeUTC(new Date()),
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
        '🔢 <b>𝗗𝗔𝗜𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📝 <i>How many times should this task repeat? (1-365)</i>',
        { parse_mode: 'HTML' }
    );
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        '🔢 <b>𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📝 <i>How many times should this task repeat? (1-365)</i>',
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
        
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
        if (task.startDate > tenMinutesFromNow) {
            scheduleTask(task);
        }
        
        ctx.session.step = null;
        delete ctx.session.task;
        
        const duration = calculateDuration(task.startDate, task.endDate);
        
        const msg = `
✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗖𝗥𝗘𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${hasContent(task.description) ? formatBlockquote(task.description) : ''}
📅 <b>Date:</b> ${formatDateUTC(task.startDate)}
⏰ <b>Time:</b> ${task.startTimeStr} - ${task.endTimeStr}
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat:</b> ${task.repeat} (${task.repeatCount || 0} times)
📊 <b>Status:</b> ⏳ Pending

🔔 <i>Notifications will start 10 minutes before the task (10 reminders).</i>
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
                '✅ <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗔𝗗𝗗𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + task.title + '</b>\n' +
                (hasContent(task.description) ? formatBlockquote(task.description) : '') + '\n' +
                '📅 ' + formatDateUTC(task.startDate) + '\n' +
                '⏰ ' + task.startTimeStr + ' - ' + task.endTimeStr + '\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

// ==========================================
// 🔍 TASK DETAIL - FIXED SUBTASK HANDLING WITH LAZY REGEX
// ==========================================
bot.action(/^task_det_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await showTaskDetail(ctx, taskId);
});

async function showTaskDetail(ctx, taskId) {
    if (!taskId) {
        await ctx.answerCbQuery('❌ Invalid task ID');
        return;
    }
    
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
${hasContent(task.description) ? formatBlockquote(task.description) : ''}
📅 <b>Next Occurrence:</b> ${formatDateTimeUTC(task.nextOccurrence)}
⏰ <b>Time:</b> ${formatTimeUTC(task.startDate)} - ${formatTimeUTC(task.endDate)}
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
        text += `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b> No subtasks yet
━━━━━━━━━━━━━━━━━━━━
`;
    }

    const buttons = [];
    
    subtasks.sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    }).forEach((subtask, index) => {
        const status = subtask.completed ? '✅' : '⭕';
        let title = subtask.title;
        if (title.length > 30) title = title.substring(0, 27) + '...';
        
        const buttonRow = [
            Markup.button.callback(
                status + ' ' + (index + 1) + '. ' + title, 
                'subtask_det_' + taskId + '_' + subtask.id
            )
        ];
        buttons.push(buttonRow);
    });
    
    const actionRow = [];
    
    if (totalSubtasks < 10) {
        actionRow.push(Markup.button.callback('➕', 'add_subtask_' + taskId));
    }
    
    actionRow.push(Markup.button.callback('✏️', 'edit_menu_' + taskId));
    actionRow.push(Markup.button.callback('🗑️', 'delete_task_' + taskId));
    actionRow.push(Markup.button.callback('✅', 'complete_' + taskId));
    
    buttons.push(actionRow);
    
    buttons.push([
        Markup.button.callback('📋 Tasks', 'view_today_tasks_1'),
        Markup.button.callback('🔙 Back', 'view_today_tasks_1')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// ==========================================
// 🔍 SUBTASK DETAIL - COMPLETELY FIXED WITH LAZY REGEX
// ==========================================
bot.action(/^subtask_det_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    if (!taskId || !subtaskId) {
        await ctx.answerCbQuery('❌ Invalid request');
        return;
    }
    
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
    const hasDesc = hasContent(subtask.description);
    
    let text = `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>Task:</b> ${task.title}
🔖 <b>Subtask:</b> ${subtask.title}
${hasDesc ? formatBlockquote(subtask.description) : ''}
📊 <b>Status:</b> ${status}
🆔 <b>ID:</b> <code>${subtask.id}</code>
📅 <b>Created:</b> ${formatDateTimeUTC(subtask.createdAt)}
━━━━━━━━━━━━━━━━━━━━`;

    const buttons = [];
    
    const actionRow = [];
    
    if (!subtask.completed) {
        actionRow.push(Markup.button.callback('✅ Complete', 'subtask_complete_' + taskId + '_' + subtaskId));
    }
    
    actionRow.push(Markup.button.callback('✏️ Edit', 'subtask_edit_' + taskId + '_' + subtaskId));
    actionRow.push(Markup.button.callback('🗑️ Delete', 'subtask_delete_' + taskId + '_' + subtaskId));
    
    buttons.push(actionRow);
    buttons.push([Markup.button.callback('🔙 Back to Task', 'task_det_' + taskId)]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^subtask_complete_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
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

bot.action(/^subtask_edit_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }
    
    ctx.session.step = 'edit_subtask_title';
    ctx.session.editSubtask = { taskId, subtaskId };
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗨𝗕𝗧𝗔𝗦𝗞</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new title for the subtask:',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^subtask_delete_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
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

bot.action(/^add_subtask_([^_]+)$/, async (ctx) => {
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
    
    ctx.session.step = 'add_subtask';
    ctx.session.addSubtasksTaskId = taskId;
    
    await ctx.reply(
        '➕ <b>𝗔𝗗𝗗 𝗦𝗨𝗕𝗧𝗔𝗦𝗞</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📌 <b>' + task.title + '</b>\n' +
        '📊 Current: ' + currentSubtasks.length + '/10 subtasks\n\n' +
        '<i>Enter subtask title:</i>\n',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
        }
    );
});

bot.action(/^complete_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');

    const subtasks = task.subtasks || [];
    const incompleteSubtasks = subtasks.filter(s => !s.completed);
    
    if (incompleteSubtasks.length > 0) {
        return ctx.answerCbQuery('❌ Complete all ' + incompleteSubtasks.length + ' pending subtasks first!');
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
            const tenMinutesFromNow = new Date(Date.now() + 10 * 60000);
            
            if (updatedTask && updatedTask.nextOccurrence > tenMinutesFromNow) {
                scheduleTask(updatedTask);
                await ctx.answerCbQuery('✅ Completed! Next occurrence scheduled.');
            } else {
                await ctx.answerCbQuery('✅ Completed! No future occurrences.');
            }
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '🔄 Next: ' + formatDateUTC(nextOccurrence) + '\n' +
                    '📊 Remaining: ' + (task.repeatCount - 1) + '\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            await ctx.answerCbQuery('✅ Task Completed & Moved to History!');
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '📅 Completed at: ' + formatDateTimeUTC(completedAtUTC) + '\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
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

bot.action(/^edit_menu_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = '✏️ <b>𝗘𝗗𝗜𝗧 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to edit:';
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🏷 Title', 'edit_task_title_' + taskId), 
            Markup.button.callback('📝 Description', 'edit_task_desc_' + taskId)
        ],
        [
            Markup.button.callback('⏰ Start Time', 'edit_task_start_' + taskId), 
            Markup.button.callback('⏱️ End Time', 'edit_task_end_' + taskId)
        ],
        [
            Markup.button.callback('🔄 Repeat', 'edit_rep_' + taskId), 
            Markup.button.callback('🔢 Count', 'edit_task_count_' + taskId)
        ],
        [Markup.button.callback('🔙 Back', 'task_det_' + taskId)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^edit_task_title_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_title';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗧𝗜𝗧𝗟𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new title:',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_desc_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_desc';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new description (Max 100 words, enter "-" for empty):',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_start_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_start';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Current start time: ' + formatTimeUTC(task.startDate) + '\n' +
        'Enter new start time (HH:MM, 24-hour):\n' +
        '⚠️ Duration will be preserved',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_end_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_end';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Current end time: ' + formatTimeUTC(task.endDate) + '\n' +
        'Enter new end time (HH:MM, 24-hour, max 23:59):',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_count_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_repeat_count';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗥𝗘𝗣𝗘𝗔𝗧 𝗖𝗢𝗨𝗡𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new repeat count (0-365):\n' +
        '📝 Current count: ' + (task.repeatCount || 0),
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_rep_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = '🔄 <b>𝗖𝗛𝗔𝗡𝗚𝗘 𝗥𝗘𝗣𝗘𝗔𝗧 𝗠𝗢𝗗𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect new repeat mode:';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ No Repeat', 'set_rep_' + taskId + '_none')],
        [Markup.button.callback('📅 Daily', 'set_rep_' + taskId + '_daily')],
        [Markup.button.callback('📅 Weekly', 'set_rep_' + taskId + '_weekly')],
        [Markup.button.callback('🔙 Back', 'edit_menu_' + taskId)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^set_rep_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const mode = ctx.match[2];
    
    try {
        const updates = { repeat: mode };
        if (mode === 'none') {
            updates.repeatCount = 0;
        } else {
            const task = await db.collection('tasks').findOne({ taskId });
            updates.repeatCount = task?.repeatCount || 7;
        }
        
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        await db.collection('history').updateMany(
            { originalTaskId: taskId }, 
            { $set: updates }
        );
        
        await ctx.answerCbQuery('✅ Updated to ' + mode);
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error updating repeat mode:', error);
        await ctx.answerCbQuery('❌ Error updating');
    }
});

bot.action(/^delete_task_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        const taskTitle = task?.title || 'Task';
        
        await db.collection('tasks').deleteOne({ taskId });
        await db.collection('history').deleteMany({ originalTaskId: taskId });
        cancelTaskSchedule(taskId);
        await ctx.answerCbQuery('✅ Task Deleted');
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗧𝗔𝗦𝗞 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + taskTitle + '</b>\n' +
                '🗑️ Task was deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
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
                text: (index + 1) + '. ' + title, 
                callback_data: 'reorder_task_select_' + task.taskId 
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

bot.action(/^reorder_task_select_([^_]+)$/, async (ctx) => {
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
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
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
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
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
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
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
                text: (index + 1) + '. ' + title, 
                callback_data: 'reorder_note_select_' + note.noteId 
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

bot.action(/^reorder_note_select_([^_]+)$/, async (ctx) => {
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
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
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
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
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
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
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

    let text = '📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗛𝗜𝗦𝗧𝗢𝗥𝗬</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ' + totalDates + ' date' + (totalDates !== 1 ? 's' : '') + '\n📄 Page: ' + page + '/' + totalPages + '\n━━━━━━━━━━━━━━━━━━━━\n';
    
    if (dateList.length === 0) {
        text += '📭 No history available.';
    } else {
        text += 'Select a date to view:';
    }
    
    const buttons = dateList.map(d => {
        const date = new Date(d.completedDate);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        return [Markup.button.callback('📅 ' + formatDateUTC(date) + ' (' + d.count + ')', 'hist_list_' + dateStr + '_1')];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', 'view_history_dates_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'view_history_dates_' + (page + 1)));
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
    let text = '📅 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗢𝗡 ' + formatDateUTC(date).toUpperCase() + '</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ' + totalTasks + ' task' + (totalTasks !== 1 ? 's' : '') + '\n📄 Page: ' + page + '/' + totalPages + '\n━━━━━━━━━━━━━━━━━━━━\n';
    
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
            taskTitle += ' [' + completed + '/' + t.subtasks.length + ']';
        }
        
        if (taskTitle.length > 40) taskTitle = taskTitle.substring(0, 37) + '...';
        
        return [
            Markup.button.callback('✅ ' + taskNum + '. ' + taskTitle + ' (' + formatTimeUTC(t.completedAt) + ')', 'hist_det_' + t._id)
        ];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', 'hist_list_' + dateStr + '_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'hist_list_' + dateStr + '_' + (page + 1)));
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
${hasContent(task.description) ? formatBlockquote(task.description) : ''}
✅ <b>Completed At:</b> ${formatDateTimeUTC(task.completedAt)}
${task.autoCompleted ? '🤖 <b>Auto-completed at 23:59</b>\n' : ''}
⏰ <b>Original Time:</b> ${formatTimeUTC(task.startDate)} - ${formatTimeUTC(task.endDate)}
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
${task.repeatCount > 0 ? '🔢 <b>Remaining Repeats:</b> ' + task.repeatCount + '\n' : ''}
━━━━━━━━━━━━━━━━━━━━
`;

        if (task.subtasks && task.subtasks.length > 0) {
            text += '📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b>\n';
            task.subtasks.sort((a, b) => {
                if (a.completed === b.completed) return 0;
                return a.completed ? 1 : -1;
            }).forEach((subtask, index) => {
                const status = subtask.completed ? '✅' : '❌';
                let title = subtask.title;
                if (title.length > 40) title = title.substring(0, 37) + '...';
                text += status + ' ' + (index + 1) + '. ' + title + '\n';
                if (hasContent(subtask.description)) {
                    text += '   ' + formatBlockquote(subtask.description) + '\n';
                }
            });
            text += '━━━━━━━━━━━━━━━━━━━━\n';
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

    let text = '🗒️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ' + totalNotes + ' note' + (totalNotes !== 1 ? 's' : '') + '\n📄 Page: ' + page + '/' + totalPages + '\n━━━━━━━━━━━━━━━━━━━━\n';
    
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
            Markup.button.callback('📄 ' + noteNum + '. ' + title, 'note_det_' + n.noteId)
        ];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', 'view_notes_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'view_notes_' + (page + 1)));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_([^_]+)$/, async (ctx) => {
    await showNoteDetail(ctx, ctx.match[1]);
});

async function showNoteDetail(ctx, noteId) {
    if (!noteId) {
        await ctx.answerCbQuery('❌ Invalid note ID');
        return;
    }
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        const text = '❌ <b>𝗡𝗢𝗧𝗘 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis note may have been deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🗒️ Notes', 'view_notes_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    let contentDisplay = note.description || '';
    
    const text = `
📝 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>
${hasContent(contentDisplay) ? formatBlockquote(contentDisplay) : ''}
📅 <b>Created:</b> ${formatDateTimeUTC(note.createdAt)}
${note.updatedAt ? '✏️ <b>Updated:</b> ' + formatDateTimeUTC(note.updatedAt) : ''}
🏷️ <b>Order:</b> ${note.orderIndex + 1}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [
        [
            Markup.button.callback('✏️ Edit Title', 'edit_note_title_' + note.noteId), 
            Markup.button.callback('✏️ Edit Content', 'edit_note_content_' + note.noteId)
        ],
        [
            Markup.button.callback('🗑️ Delete', 'delete_note_' + note.noteId),
            Markup.button.callback('🔙 Back to Notes', 'view_notes_1')
        ]
    ];

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// ==========================================
// ✏️ EDIT NOTE HANDLERS
// ==========================================
bot.action(/^edit_note_title_([^_]+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_title';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new title:',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'note_det_' + noteId)]])
        }
    );
});

bot.action(/^edit_note_content_([^_]+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_content';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new content (Max 400 words, enter "-" for empty):',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'note_det_' + noteId)]])
        }
    );
});

bot.action(/^delete_note_([^_]+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const note = await db.collection('notes').findOne({ noteId });
        const noteTitle = note?.title || 'Note';
        
        await db.collection('notes').deleteOne({ noteId: noteId });
        await reindexNotes();
        await ctx.answerCbQuery('✅ Note Deleted');
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗡𝗢𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + noteTitle + '</b>\n' +
                '🗑️ Note was deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
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
    const text = '📥 <b>𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n📁 <i>Files will be sent as JSON documents</i>';
    
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
            filename: 'global_tasks_' + Date.now() + '.json'
        }, {
            caption: '📋 <b>Global Tasks Data</b>\nTotal: ' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '\n📅 ' + formatDateTimeUTC(new Date()),
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + tasks.length + ' tasks');
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
            filename: 'global_history_' + Date.now() + '.json'
        }, {
            caption: '📜 <b>Global History Data</b>\nTotal: ' + history.length + ' item' + (history.length !== 1 ? 's' : '') + '\n📅 ' + formatDateTimeUTC(new Date()),
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + history.length + ' history items');
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
            filename: 'global_notes_' + Date.now() + '.json'
        }, {
            caption: '🗒️ <b>Global Notes Data</b>\nTotal: ' + notes.length + ' note' + (notes.length !== 1 ? 's' : '') + '\n📅 ' + formatDateTimeUTC(new Date()),
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + notes.length + ' notes');
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
                filename: 'global_tasks_' + timestamp + '.json'
            }, {
                caption: '📋 <b>Tasks</b> (' + tasks.length + ' item' + (tasks.length !== 1 ? 's' : '') + ')',
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
                filename: 'global_history_' + timestamp + '.json'
            }, {
                caption: '📜 <b>History</b> (' + history.length + ' item' + (history.length !== 1 ? 's' : '') + ')',
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
                filename: 'global_notes_' + timestamp + '.json'
            }, {
                caption: '🗒️ <b>Notes</b> (' + notes.length + ' item' + (notes.length !== 1 ? 's' : '') + ')',
                parse_mode: 'HTML'
            });
        }
        
        await ctx.reply(
            '📦 <b>ALL GLOBAL DATA DOWNLOAD COMPLETE</b>\n━━━━━━━━━━━━━━━━━━━━\n' +
            '📋 Tasks: ' + tasks.length + ' item' + (tasks.length !== 1 ? 's' : '') + '\n' +
            '📜 History: ' + history.length + ' item' + (history.length !== 1 ? 's' : '') + '\n' +
            '🗒️ Notes: ' + notes.length + ' item' + (notes.length !== 1 ? 's' : '') + '\n' +
            '📊 Total: ' + totalItems + ' items\n' +
            '📁 ' + [tasks, history, notes].filter(a => a.length > 0).length + ' JSON files sent\n' +
            '📅 ' + formatDateTimeUTC(new Date()) + '\n━━━━━━━━━━━━━━━━━━━━',
            { parse_mode: 'HTML' }
        );
        
        await ctx.answerCbQuery('✅ Sent ' + totalItems + ' items across ' + [tasks, history, notes].filter(a => a.length > 0).length + ' files');
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
        const text = '🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>⚠️ WARNING: This will delete data for EVERYONE!</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Select what to delete:</b>';
        
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
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + taskCount + ' GLOBAL task' + (taskCount !== 1 ? 's' : '') + '?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
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
                    filename: 'global_tasks_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + result.deletedCount + ' global task' + (result.deletedCount !== 1 ? 's' : '') + '\n' + (tasks.length > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + result.deletedCount + ' tasks have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
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
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + historyCount + ' GLOBAL history item' + (historyCount !== 1 ? 's' : '') + '?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
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
                    filename: 'global_history_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + result.deletedCount + ' global history item' + (result.deletedCount !== 1 ? 's' : '') + '\n' + (history.length > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + result.deletedCount + ' history items have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
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
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + notesCount + ' GLOBAL note' + (notesCount !== 1 ? 's' : '') + '?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
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
                    filename: 'global_notes_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + result.deletedCount + ' global note' + (result.deletedCount !== 1 ? 's' : '') + '\n' + (notes.length > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + result.deletedCount + ' notes have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
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
        
        const text = '⚠️ <b>⚠️ ⚠️ ⚠️ FINAL WARNING ⚠️ ⚠️ ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + totalCount + ' GLOBAL items?\n\n<b>⚠️ THIS WILL DELETE EVERYTHING FOR EVERYONE!</b>\n\n📋 Tasks: ' + tasksCount + '\n📜 History: ' + historyCount + '\n🗒️ Notes: ' + notesCount + '\n\n<b>⚠️ THIS ACTION CANNOT BE UNDONE!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
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
                filename: 'global_all_backup_tasks_' + timestamp + '.json' 
            });
        }
        
        if (history.length > 0) {
            const histBuff = Buffer.from(JSON.stringify(history, null, 2));
            await ctx.replyWithDocument({ 
                source: histBuff, 
                filename: 'global_all_backup_history_' + timestamp + '.json' 
            });
        }
        
        if (notes.length > 0) {
            const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
            await ctx.replyWithDocument({ 
                source: notesBuff, 
                filename: 'global_all_backup_notes_' + timestamp + '.json' 
            });
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + totalDeleted + ' items total\n\n📋 Tasks: ' + tasksResult.deletedCount + '\n📜 History: ' + historyResult.deletedCount + '\n🗒️ Notes: ' + notesResult.deletedCount + '\n\n' + ((tasks.length + history.length + notes.length) > 0 ? '📁 Backup files sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🔥 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗔𝗟𝗟 𝗗𝗔𝗧𝗔 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + totalDeleted + ' items have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
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
// ⏰ HALF HOURLY SUMMARY
// ==========================================
async function sendHalfHourlySummary() {
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
⏰ ${formatTimeUTC(new Date())} ‧ 📅 ${formatDateUTC(new Date())}
━━━━━━━━━━━━━━━━━━━━
✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗢𝗗𝗔𝗬:</b> (${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''})`;

        if (completedTasks.length > 0) {
            completedTasks.slice(0, 5).forEach((task, index) => {
                summaryText += '\n' + (index + 1) + '‧ ' + task.title + ' ‧ ' + formatTimeUTC(task.completedAt);
            });
            if (completedTasks.length > 5) {
                summaryText += '\n...and ' + (completedTasks.length - 5) + ' more';
            }
        } else {
            summaryText += '\n📭 No tasks completed yet.';
        }
        
        summaryText += '\n\n⏳ <b>𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗧𝗢𝗗𝗔𝗬:</b> (' + pendingTasks.length + ' task' + (pendingTasks.length !== 1 ? 's' : '') + ')';
        
        if (pendingTasks.length > 0) {
            pendingTasks.slice(0, 5).forEach((task, index) => {
                summaryText += '\n' + (index + 1) + '‧ ' + task.title + ' ‧ ' + formatTimeUTC(task.nextOccurrence);
            });
            if (pendingTasks.length > 5) {
                summaryText += '\n...and ' + (pendingTasks.length - 5) + ' more';
            }
        } else {
            summaryText += '\n📭 No pending tasks for today';
        }
        
        summaryText += '\n━━━━━━━━━━━━━━━━━━━━\n⏰ Next update in 30 minutes';
        
        try {
            await bot.telegram.sendMessage(CHAT_ID, summaryText, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Error sending half-hourly summary:', e.message);
        }
        
    } catch (error) {
        console.error('Error generating half-hourly summary:', error.message);
    }
}

function scheduleHalfHourlySummary() {
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    hourlySummaryJob = schedule.scheduleJob('*/30 * * * *', async () => {
        if (isShuttingDown) return;
        console.log('⏰ Sending global half-hourly summaries at ' + formatTimeUTC(new Date()) + '...');
        await sendHalfHourlySummary();
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
            scheduleHalfHourlySummary();
            scheduleAutoComplete();
            
            const server = app.listen(PORT, '0.0.0.0', () => {
                console.log('🌐 Web interface running on port ' + PORT);
                console.log('📱 Web URL: http://localhost:' + PORT);
                console.log('🌍 Public Web URL: ' + WEB_APP_URL);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error('❌ Port ' + PORT + ' is already in use. Trying port ' + (PORT + 1) + '...');
                    app.listen(PORT + 1, '0.0.0.0', () => {
                        console.log('🌐 Web interface running on port ' + (PORT + 1));
                        console.log('📱 Web URL: http://localhost:' + (PORT + 1));
                    });
                } else {
                    console.error('❌ Express server error:', err);
                }
            });
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
            console.log('👤 Bot only responding to user ID: ' + CHAT_ID);
            console.log('⏰ Current Time: ' + formatTimeUTC(new Date()));
            console.log('📊 Currently tracking ' + activeSchedules.size + ' tasks');
            
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
                            '📋 <b>𝗧𝗢𝗗𝗔𝗬\'S 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>\n' +
                            '━━━━━━━━━━━━━━━━━━━━\n' +
                            '📊 Total: ' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '\n' +
                            '📅 ' + formatDateUTC(new Date()) + '\n' +
                            '━━━━━━━━━━━━━━━━━━━━',
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
    
    console.log('🛑 ' + signal + ' received, stopping bot gracefully...');
    
    for (const [taskId, schedule] of activeSchedules) {
        try {
            if (schedule.startJob) schedule.startJob.cancel();
            if (schedule.interval) clearInterval(schedule.interval);
        } catch (e) {
            console.error('Error cleaning up task ' + taskId + ':', e.message);
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

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

start();

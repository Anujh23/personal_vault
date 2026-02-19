class ReminderIndicators {
    constructor() {
        this.indicatorsContainer = document.getElementById('reminder-indicators');
        this.reminderListContainer = document.getElementById('reminder-list-container');
        this.reminderList = document.getElementById('reminder-list');
        this.reminderCount = document.getElementById('reminder-count');
        this.reminderCountHeader = document.getElementById('reminder-count-header');
        this.allReminders = [];

        // Initialize if elements exist
        if (this.indicatorsContainer) {
            this.setupEventListeners();
            this.loadAllReminders();
        }
    }

    setupEventListeners() {
        // Toggle reminder list when clicking on badge
        if (this.indicatorsContainer) {
            this.indicatorsContainer.addEventListener('click', (e) => {
                if (e.target.closest('.reminder-badge')) {
                    this.toggleReminderList();
                }
            });
        }

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.reminderListContainer &&
                !this.indicatorsContainer?.contains(e.target) &&
                this.reminderListContainer.classList.contains('show')) {
                this.reminderListContainer.classList.remove('show');
            }
        });
    }

    async loadAllReminders() {
        if (!window.dashboardAuth?.token) return;

        try {
            const response = await fetch(`${window.API_BASE_URL || ''}/api/reminders`, {
                headers: {
                    'Authorization': `Bearer ${window.dashboardAuth.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch reminders');

            const result = await response.json();
            this.allReminders = result.data || [];

            // Filter active/pending reminders
            const activeReminders = this.allReminders.filter(r =>
                r.status === 'Active' || r.status === 'pending'
            );

            this.updateIndicators(activeReminders);
        } catch (error) {
            console.error('Error loading reminders:', error);
        }
    }

    updateIndicators(reminders) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Categorize reminders
        const overdue = reminders.filter(r => new Date(r.reminder_date) < now);
        const todayReminders = reminders.filter(r => {
            const rDate = new Date(r.reminder_date);
            return rDate >= now && rDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
        });
        const upcoming = reminders.filter(r => {
            const rDate = new Date(r.reminder_date);
            return rDate >= new Date(today.getTime() + 24 * 60 * 60 * 1000);
        });

        // Update badge count
        const totalActive = overdue.length + todayReminders.length + upcoming.length;
        if (this.reminderCount) {
            this.reminderCount.textContent = totalActive;
            this.reminderCount.style.display = totalActive > 0 ? 'flex' : 'none';
        }

        // Update header count
        if (this.reminderCountHeader) {
            this.reminderCountHeader.textContent = `${totalActive} active`;
        }

        // Update list
        this.updateReminderList({ overdue, today: todayReminders, upcoming });
    }

    updateReminderList({ overdue = [], today = [], upcoming = [] }) {
        if (!this.reminderList) return;

        this.reminderList.innerHTML = '';
        const total = overdue.length + today.length + upcoming.length;

        if (total === 0) {
            this.reminderList.innerHTML = `
                <div class="reminder-empty">
                    <i data-lucide="check-circle" width="24" height="24"></i>
                    <p>No active reminders</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        // Add overdue section
        if (overdue.length > 0) {
            this.addSection('Overdue', overdue, 'alert-circle', '#ef4444');
        }

        // Add today section
        if (today.length > 0) {
            this.addSection('Today', today, 'calendar', '#3b82f6');
        }

        // Add upcoming section
        if (upcoming.length > 0) {
            this.addSection('Upcoming', upcoming, 'clock', '#f59e0b');
        }

        lucide.createIcons();
    }

    addSection(title, items, iconName, iconColor) {
        const section = document.createElement('div');
        section.className = 'reminder-dropdown-section';
        section.innerHTML = `
            <div class="reminder-dropdown-header" style="color: ${iconColor};">
                <i data-lucide="${iconName}" width="14" height="14"></i>
                <span>${title} (${items.length})</span>
            </div>
        `;

        items.forEach(reminder => {
            section.appendChild(this.createReminderItem(reminder));
        });

        this.reminderList.appendChild(section);
    }

    createReminderItem(reminder) {
        const item = document.createElement('div');
        item.className = 'reminder-dropdown-item';

        const time = new Date(reminder.reminder_date);
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });

        item.innerHTML = `
            <div class="reminder-dropdown-time">${dateStr} ${timeStr}</div>
            <div class="reminder-dropdown-title">${reminder.title || 'Reminder'}</div>
            ${reminder.description ? `<div class="reminder-dropdown-desc">${reminder.description}</div>` : ''}
        `;

        item.addEventListener('click', () => {
            if (window.app) {
                window.app.showSection('reminders');
                window.app.viewRecord(reminder.id);
            }
            this.reminderListContainer?.classList.remove('show');
        });

        return item;
    }

    toggleReminderList() {
        if (this.reminderListContainer) {
            this.reminderListContainer.classList.toggle('show');
            // Refresh reminders when opening
            if (this.reminderListContainer.classList.contains('show')) {
                this.loadAllReminders();
            }
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.reminderIndicators = new ReminderIndicators();
});

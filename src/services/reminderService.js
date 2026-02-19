class ReminderService {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.checkInterval = null;
        this.lastCheck = null;
        this.reminderCheckInterval = 30 * 1000; // Check every 30 seconds
        this.snoozeOptions = [5, 10, 15, 30, 60]; // Snooze options in minutes
    }

    start() {
        // Initial check
        this.checkReminders();

        // Set up periodic checking
        this.checkInterval = setInterval(() => {
            this.checkReminders();
        }, this.reminderCheckInterval);

        console.log('🔔 Reminder service started');
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    async checkReminders() {
        try {
            const now = new Date();
            this.lastCheck = now;

            // Get reminders that are due and not yet notified
            const response = await fetch(`${window.API_BASE_URL || ''}/api/reminders/due`, {
                headers: {
                    'Authorization': `Bearer ${window.dashboardAuth?.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch reminders');

            const reminders = await response.json();

            // Show notifications for each due reminder
            reminders.forEach(reminder => this.showNotification(reminder));

            // Update the UI with upcoming/overdue reminders
            this.updateReminderIndicators(reminders);

        } catch (error) {
            console.error('Error checking reminders:', error);
        }
    }

    showNotification(reminder) {
        if (!reminder) return;

        // Check if notifications are supported and permitted
        if (!window.Notification) {
            console.warn('Notifications not supported in this environment');
            return;
        }

        if (Notification.permission !== 'granted') {
            console.log('Notification permission not granted, requesting...');
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this._showNotification(reminder);
                }
            });
        } else {
            this._showNotification(reminder);
        }
    }

    _showNotification(reminder) {
        const notification = new Notification(reminder.title || 'Reminder', {
            body: reminder.description || 'You have a reminder!',
            icon: '/assets/icons/icon.png',
            silent: false,
            requireInteraction: true,
            actions: [
                {
                    action: 'snooze',
                    title: 'Snooze 5min',
                    icon: '/assets/icons/snooze.png'
                },
                {
                    action: 'complete',
                    title: 'Complete',
                    icon: '/assets/icons/check.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                    icon: '/assets/icons/dismiss.png'
                }
            ]
        });

        notification.onclick = (event) => {
            if (event.action === 'snooze') {
                this.snoozeReminder(reminder.id, 5);
            } else if (event.action === 'complete') {
                this.completeReminder(reminder.id);
            } else if (event.action === 'dismiss') {
                this.markAsNotified(reminder.id);
            } else {
                // Default click - open app and view reminder
                this.mainWindow.focus();
                this.mainWindow.webContents.send('navigate-to', {
                    section: 'reminders',
                    recordId: reminder.id
                });
            }
            notification.close();
        };

        // Auto close after 2 minutes
        setTimeout(() => {
            if (notification) notification.close();
        }, 120000);
    }

    async completeReminder(reminderId) {
        try {
            const response = await fetch(`${window.API_BASE_URL || ''}/api/reminders/${reminderId}/complete`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.dashboardAuth?.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('✅ Reminder marked as completed');
                if (this.mainWindow && this.mainWindow.webContents) {
                    this.mainWindow.webContents.send('show-toast', {
                        message: 'Reminder completed!',
                        type: 'success'
                    });
                    this.mainWindow.webContents.send('reminder-completed', { reminderId });
                }
            }
        } catch (error) {
            console.error('Error completing reminder:', error);
        }
    }

    async snoozeReminder(reminderId, minutes) {
        try {
            const response = await fetch(`${window.API_BASE_URL || ''}/api/reminders/${reminderId}/snooze`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.dashboardAuth?.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ minutes })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Reminder snoozed:', result.message);
                // Show confirmation toast if app has a toast system
                if (this.mainWindow && this.mainWindow.webContents) {
                    this.mainWindow.webContents.send('show-toast', {
                        message: result.message,
                        type: 'info'
                    });
                }
            } else {
                console.error('Failed to snooze reminder');
            }
        } catch (error) {
            console.error('Error snoozing reminder:', error);
        }
    }

    async markAsNotified(reminderId) {
        try {
            await fetch(`${window.API_BASE_URL || ''}/api/reminders/${reminderId}/notified`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.dashboardAuth?.token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Error marking reminder as notified:', error);
        }
    }

    updateReminderIndicators(reminders) {
        if (!this.mainWindow || !this.mainWindow.webContents) return;

        const now = new Date();
        const upcoming = [];
        const overdue = [];

        reminders.forEach(reminder => {
            const reminderDate = new Date(reminder.reminder_date);
            if (reminderDate < now) {
                overdue.push(reminder);
            } else {
                upcoming.push(reminder);
            }
        });

        this.mainWindow.webContents.send('reminders-updated', {
            upcoming,
            overdue,
            lastCheck: this.lastCheck
        });
    }
}

module.exports = ReminderService;

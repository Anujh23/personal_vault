// Personal Dashboard - COMPLETE SOLUTION: Premium UI + Working Family Tree + Self Management
window.dashboardAuth = window.dashboardAuth || { isLoggedIn: false, currentUser: null, token: null };
class DataManager {
    constructor() {
        this.currentSection = 'dashboard';
        this.currentTable = null;
        this.editingRecord = null;
        this.currentPage = 1;
        this.recordsPerPage = 10;
        this.filteredData = [];
        this.tables = this.initializeTables();
        this.sampleData = this.getSampleData();
        this.confirmCallback = null;
        this.uploadedFiles = [];
        this.isEditMode = false;
        this.fileUploadInitialized = false;
        this.activityLog = this.loadActivityLog();

        // Loading overlay management (prevents flicker with multiple API calls)
        this._loadingCount = 0;
        this._loadingShownAt = 0;
        this._loadingMinMs = 250;
        this._loadingHideTimer = null;

        // API Configuration - fallback to localhost if not set
        this.API_BASE_URL = (typeof window.API_BASE_URL !== 'undefined' && window.API_BASE_URL) ? window.API_BASE_URL : 'http://localhost:3000';
        window.API_BASE_URL = this.API_BASE_URL;
        console.log('🔌 API Base URL:', this.API_BASE_URL);

        // Hook save function to update activity log
        const originalSaveData = this.saveData?.bind(this);
        if (originalSaveData) {
            this.saveData = (table, record) => {
                originalSaveData(table, record);
                this.logActivity(`${table} updated: ${record.name || ''}`);
                this.renderRecentActivity();
            };
        }



        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }


    // Helper method for API requests to PostgreSQL
    async apiRequest(endpoint, method = 'GET', data = null, { showLoader = true } = {}) {
        const url = `${this.API_BASE_URL}${endpoint}`;
        const token = window.dashboardAuth?.token || '';
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        if (showLoader) this.beginLoading('Loading');

        try {
            const response = await fetch(url, options);
            const rawText = await response.text();
            let result = {};
            if (rawText) {
                try {
                    result = JSON.parse(rawText);
                } catch (e) {
                    // Some middleware may return plain text.
                    result = { error: rawText };
                }
            }

            if (!response.ok) {
                const message = result.error || response.statusText || 'API request failed';

                // If the token is missing/invalid or the session expired,
                // force a logout and send the user back to the login screen.
                if (response.status === 401 || response.status === 403) {
                    console.warn('Authentication error, logging out:', message);
                    if (typeof window.logout === 'function') {
                        window.logout();
                    } else {
                        if (window.dashboardAuth) {
                            window.dashboardAuth.isLoggedIn = false;
                            window.dashboardAuth.currentUser = null;
                            window.dashboardAuth.token = null;
                        }
                        try {
                            localStorage.removeItem('dashboardAuthState');
                        } catch (e) {
                            console.warn('Unable to clear auth state from localStorage', e);
                        }
                        if (typeof window.showLoginScreen === 'function') {
                            window.showLoginScreen();
                        }
                    }
                    this.showToast('Session expired. Please log in again.', 'error');
                } else {
                    this.showToast(message, 'error');
                }

                throw new Error(message);
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            if (!error._handled) {
                this.showToast(error.message || 'An error occurred', 'error');
            }
            throw error;
        } finally {
            if (showLoader) this.endLoading();
        }
    }

    setLoadingVisible(visible) {
        const loadingScreen = document.getElementById('loadingScreen');
        const appContainer = document.getElementById('appContainer');
        if (loadingScreen) loadingScreen.style.display = visible ? 'flex' : 'none';
        if (appContainer) appContainer.classList.toggle('app-blurred', Boolean(visible));
    }

    beginLoading(text = 'Loading') {
        if (this._loadingHideTimer) {
            clearTimeout(this._loadingHideTimer);
            this._loadingHideTimer = null;
        }

        this._loadingCount = (this._loadingCount || 0) + 1;

        const loadingTextEl = document.querySelector('#loadingScreen .loading-text');
        if (loadingTextEl && text) loadingTextEl.textContent = text;

        if (this._loadingCount === 1) {
            this._loadingShownAt = Date.now();
            this.setLoadingVisible(true);
        }
    }

    endLoading() {
        this._loadingCount = Math.max(0, (this._loadingCount || 0) - 1);
        if (this._loadingCount !== 0) return;

        const elapsed = Date.now() - (this._loadingShownAt || 0);
        const wait = Math.max(0, (this._loadingMinMs || 0) - elapsed);

        this._loadingHideTimer = setTimeout(() => {
            this.setLoadingVisible(false);
        }, wait);
    }

    async withLoading(fn, { text = 'Loading' } = {}) {
        this.beginLoading(text);
        try {
            return await fn();
        } finally {
            this.endLoading();
        }
    }

    // Helper function to convert ArrayBuffer to base64 for non-image files
    arrayBufferToBase64(buffer) {
        if (!buffer) return '';
        try {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            return `data:application/octet-stream;base64,${btoa(binary)}`;
        } catch (error) {
            console.error('Error converting ArrayBuffer to base64:', error);
            return '';
        }
    }

    init() {
        console.log('🚀 Initializing Premium Personal Dashboard...');

        this.beginLoading('Loading');

        setTimeout(() => {
            try {
                this.loadTheme();
                this.initializeData();
                this.initializeEventListeners();
                this.showSection('dashboard');
                if (window.dashboardAuth?.token) {
                    this.updateDashboardStats();
                    this.updateWelcomeStats();
                    this.loadUpcomingReminders();
                }
                console.log('✅ Premium Personal Dashboard initialization complete');
            } catch (error) {
                console.error('❌ Initialization error:', error);
                this.showToast('Dashboard loaded with some limitations', 'warning');
            } finally {
                this.endLoading();
                this.showSection('dashboard');
            }
        }, 800);
    }

    async loadUpcomingReminders() {
        if (!window.dashboardAuth?.token) return;

        const container = document.getElementById('upcomingReminders');
        if (!container) return;

        try {
            // Force refresh to get latest reminders (bypass cache)
            const payload = await this.fetchDashboardStats({ force: true });
            const items = Array.isArray(payload?.upcomingReminders) ? payload.upcomingReminders : [];

            // Separate into overdue and upcoming (check for 'Pending' status)
            const now = new Date();
            const activeItems = items.filter(r => r.status === 'Pending');
            const overdue = activeItems.filter(r => new Date(r.reminder_date) < now);
            const upcoming = activeItems.filter(r => new Date(r.reminder_date) >= now);

            if (items.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🔔</div>
                        <h3>No Reminders</h3>
                        <p>Create a reminder to get started</p>
                        <button class="btn btn-primary" onclick="app.showSection('reminders'); app.showRecordForm();">
                            <span>Create Reminder</span>
                        </button>
                    </div>
                `;
                return;
            }

            let html = '';

            // Show overdue section if any
            if (overdue.length > 0) {
                html += `
                    <div class="reminder-section">
                        <div class="reminder-section-header overdue">
                            <i data-lucide="alert-circle" width="14" height="14"></i>
                            <span>Overdue (${overdue.length})</span>
                        </div>
                        ${overdue.map(r => this.createReminderItem(r, true)).join('')}
                    </div>
                `;
            }

            // Show upcoming section if any
            if (upcoming.length > 0) {
                html += `
                    <div class="reminder-section">
                        <div class="reminder-section-header">
                            <i data-lucide="clock" width="14" height="14"></i>
                            <span>Upcoming (${upcoming.length})</span>
                        </div>
                        ${upcoming.map(r => this.createReminderItem(r, false)).join('')}
                    </div>
                `;
            }

            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<div class="empty-state">Unable to load reminders</div>';
        }
    }

    createReminderItem(reminder, isOverdue) {
        const date = new Date(reminder.reminder_date);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString();
        const iconName = isOverdue ? 'alert-circle' : 'clock';
        const iconColor = isOverdue ? '#ef4444' : '#f59e0b';

        return `
            <div class="reminder-item ${isOverdue ? 'overdue' : ''}" onclick="app.showSection('reminders'); app.viewRecord(${reminder.id});">
                <div class="reminder-item-icon" style="color: ${iconColor};">
                    <i data-lucide="${iconName}" width="20" height="20"></i>
                </div>
                <div class="reminder-item-content">
                    <div class="reminder-item-title">${reminder.title || 'Reminder'}</div>
                    <div class="reminder-item-meta">${dateStr} at ${timeStr}</div>
                    ${reminder.description ? `<div class="reminder-item-desc">${reminder.description}</div>` : ''}
                </div>
            </div>
        `;
    }

    showLoadingScreen() {
        this.setLoadingVisible(true);
    }

    hideLoadingScreen() {
        try {
            const appContainer = document.getElementById('appContainer');
            this.setLoadingVisible(false);
            if (appContainer) {
                console.log('✅ Loading screen hidden successfully');
            } else {
                console.warn('⚠️ Loading screen or app container not found');
                // Fallback: ensure content is visible
                document.body.style.visibility = 'visible';
                const main = document.querySelector('main');
                if (main) main.style.display = 'block';
            }
        } catch (error) {
            console.error('❌ Error hiding loading screen:', error);
            // Emergency fallback
            document.body.style.visibility = 'visible';
            document.body.innerHTML = document.body.innerHTML; // Force re-render
        }
    }

    initializeTables() {
        return {
            personal_info: {
                name: "Personal Information",
                icon: "👤",
                fields: [
                    { name: 'name', label: 'Full Name', type: 'text', required: true },
                    { name: 'father_name', label: 'Father Name', type: 'text' },
                    { name: 'mother_name', label: 'Mother Name', type: 'text' },
                    { name: 'email', label: 'Email', type: 'email' },
                    { name: 'phone', label: 'Phone', type: 'tel' },
                    { name: 'aadhar', label: 'Aadhar Number', type: 'text' },
                    { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
                    { name: 'blood_group', label: 'Blood Group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
                    { name: 'date_of_birth', label: 'Date of Birth', type: 'date' },
                    { name: 'designation', label: 'Designation', type: 'text' },
                    { name: 'current_address', label: 'Current Address', type: 'textarea' },
                    { name: 'permanent_address', label: 'Permanent Address', type: 'textarea' },
                    { name: 'is_self', label: 'Is This You?', type: 'select', options: ['No', 'Yes'] }
                ]
            },
            family_members: {
                name: "Family Members",
                icon: "👨‍👩‍👧‍👦",
                fields: [
                    { name: 'name', label: 'Full Name', type: 'text', required: true },
                    { name: 'relationship', label: 'Relationship', type: 'select', options: ['Self', 'Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Cousin', 'Other'] },
                    { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
                    { name: 'date_of_birth', label: 'Date of Birth', type: 'date' },
                    { name: 'phone', label: 'Phone Number', type: 'tel' },
                    { name: 'email', label: 'Email', type: 'email' },
                    { name: 'occupation', label: 'Occupation', type: 'text' },
                    { name: 'address', label: 'Address', type: 'textarea' },
                    { name: 'father_id', label: 'Father (Select from family)', type: 'number' },
                    { name: 'mother_id', label: 'Mother (Select from family)', type: 'number' },
                    { name: 'is_alive', label: 'Is Alive', type: 'select', options: ['Yes', 'No'] }
                ]
            },
            shareholdings: {
                name: "Share holdings",
                icon: "📈",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'holder_name', label: 'Holder Name', type: 'text', required: true },
                    { name: 'company_name', label: 'Company Name', type: 'text' },
                    { name: 'entity_type', label: 'Entity Type', type: 'select', options: ['Private Limited', 'Public Limited', 'Partnership', 'LLP', 'Sole Proprietorship', 'NBFC', 'Product'] },
                    { name: 'share_holding_certificate_status', label: 'Share Holding Certificate Status', type: 'text' },
                    { name: 'loan_amount', label: 'Loan Amount', type: 'number', step: '0.01' },
                    { name: 'shareholding_percent', label: 'Shareholding %', type: 'number', step: '0.01' },
                    { name: 'equity_shares', label: 'Equity Shares', type: 'number' },
                    { name: 'current_value', label: 'Current Value', type: 'number', step: '0.01' },
                    { name: 'remarks', label: 'Remarks', type: 'textarea' },
                    { name: 'filter_name', label: 'Filter Name', type: 'text' }
                ]
            },
            properties: {
                name: "Properties",
                icon: "🏠",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'name', label: 'Property Name', type: 'text', required: true },
                    { name: 'owner_user', label: 'Owner', type: 'text' },
                    { name: 'property_holder_name', label: 'Property Holder Name', type: 'text' },
                    { name: 'property_type', label: 'Property Type', type: 'select', options: ['Residential', 'Commercial', 'Agricultural', 'Industrial'] },
                    { name: 'property_address', label: 'Property Address', type: 'textarea' },
                    { name: 'state', label: 'State', type: 'text' },
                    { name: 'total_area', label: 'Total Area (sq ft)', type: 'number', step: '0.01' },
                    { name: 'rooms_count', label: 'Number of Rooms', type: 'number' },
                    { name: 'property_value', label: 'Property Value', type: 'number', step: '0.01' },
                    { name: 'registration_fees', label: 'Registration Fees', type: 'number', step: '0.01' },
                    { name: 'payment_type', label: 'Payment Type', type: 'select', options: ['Cash', 'Loan', 'Mixed'] },
                    { name: 'amount', label: 'Amount', type: 'number', step: '0.01' },
                    { name: 'loan_on_property', label: 'Loan on Property', type: 'select', options: ['Yes', 'No'] },
                    { name: 'loan_from_bank', label: 'Loan from Bank', type: 'text' },
                    { name: 'loan_amount', label: 'Loan Amount', type: 'number', step: '0.01' },
                    { name: 'loan_tenure_years', label: 'Loan Tenure (Years)', type: 'number' },
                    { name: 'total_emi', label: 'Total EMI', type: 'number', step: '0.01' },
                    { name: 'emi_amount', label: 'EMI Amount', type: 'number', step: '0.01' },
                    { name: 'total_emi_payment', label: 'Total EMI Payment', type: 'number', step: '0.01' },
                    { name: 'loan_start_date', label: 'Loan Start Date', type: 'date' },
                    { name: 'loan_end_date', label: 'Loan End Date', type: 'date' },
                    { name: 'loan_status', label: 'Loan Status', type: 'select', options: ['Active', 'Closed', 'Overdue'] },
                    { name: 'income_from_property', label: 'Income from Property', type: 'select', options: ['Yes', 'No'] },
                    { name: 'tenant_name', label: 'Tenant Name', type: 'text' },
                    { name: 'rent_agreement_start_date', label: 'Rent Agreement Start Date', type: 'date' },
                    { name: 'rent_agreement_end_date', label: 'Rent Agreement End Date', type: 'date' },
                    { name: 'monthly_rent', label: 'Monthly Rent', type: 'number', step: '0.01' },
                    { name: 'monthly_maintenance', label: 'Monthly Maintenance', type: 'number', step: '0.01' },
                    { name: 'total_income', label: 'Total Income', type: 'number', step: '0.01' },
                    { name: 'registration_status', label: 'Registration Status', type: 'select', options: ['Registered', 'Pending', 'Not Registered'] },
                    { name: 'mutation', label: 'Mutation', type: 'select', options: ['Done', 'Pending', 'Not Required'] },
                    { name: 'remark', label: 'Remarks', type: 'textarea' },
                    { name: 'other_documents', label: 'Other Documents', type: 'textarea' }
                ]
            },
            assets: {
                name: "Assets",
                icon: "💎",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'name', label: 'Asset Name', type: 'text', required: true },
                    { name: 'owner_user', label: 'Owner', type: 'text' },
                    { name: 'asset_type', label: 'Asset Type', type: 'select', options: ['Electronics', 'Jewelry', 'Vehicle', 'Furniture', 'Appliance', 'Other'] },
                    { name: 'asset_category', label: 'Asset Category', type: 'text' },
                    { name: 'model', label: 'Model', type: 'text' },
                    { name: 'brand', label: 'Brand', type: 'text' },
                    { name: 'purchase_date', label: 'Purchase Date', type: 'date' },
                    { name: 'purchase_price', label: 'Purchase Price', type: 'number', step: '0.01' },
                    { name: 'current_value', label: 'Current Value', type: 'number', step: '0.01' },
                    { name: 'condition', label: 'Condition', type: 'select', options: ['Excellent', 'Good', 'Fair', 'Poor'] },
                    { name: 'location', label: 'Location', type: 'text' },
                    { name: 'serial_no', label: 'Serial Number', type: 'text' },
                    { name: 'has_insurance', label: 'Has Insurance', type: 'select', options: ['Yes', 'No'] },
                    { name: 'insurance_provider', label: 'Insurance Provider', type: 'text' },
                    { name: 'insurance_expiry_date', label: 'Insurance Expiry Date', type: 'date' },
                    { name: 'has_warranty', label: 'Has Warranty', type: 'select', options: ['Yes', 'No'] },
                    { name: 'warranty_expiry_date', label: 'Warranty Expiry Date', type: 'date' },
                    { name: 'remarks', label: 'Remarks', type: 'textarea' },
                    { name: 'other_documents', label: 'Other Documents', type: 'textarea' }
                ]
            },
            banking_details: {
                name: "Banking Details",
                icon: "🏦",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'name', label: 'Account Name', type: 'text', required: true },
                    { name: 'account_holder', label: 'Account Holder', type: 'text' },
                    { name: 'bank_name', label: 'Bank Name', type: 'text' },
                    { name: 'account_type', label: 'Account Type', type: 'select', options: ['Savings', 'Current', 'Fixed Deposit', 'Recurring Deposit'] },
                    { name: 'account_number', label: 'Account Number', type: 'text' },
                    { name: 'ifsc_code', label: 'IFSC Code', type: 'text' },
                    { name: 'user_id', label: 'User ID', type: 'text' },
                    { name: 'password', label: 'Password', type: 'password' },
                    { name: 'branch', label: 'Branch', type: 'text' },
                    { name: 'branch_code', label: 'Branch Code', type: 'text' },
                    { name: 'contact_no', label: 'Contact Number', type: 'tel' },
                    { name: 'mail_id', label: 'Email ID', type: 'email' },
                    { name: 'card_type', label: 'Card Type', type: 'select', options: ['Debit Card', 'Credit Card', 'Both', 'None'] },
                    { name: 'card_no', label: 'Card Number', type: 'text' },
                    { name: 'card_expiry', label: 'Card Expiry', type: 'text' }
                ]
            },
            stocks: {
                name: "Stocks & Investments",
                icon: "📊",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'name', label: 'Investment Name', type: 'text', required: true },
                    { name: 'stock_name', label: 'Stock Name', type: 'text' },
                    { name: 'investment_type', label: 'Investment Type', type: 'select', options: ['Equity', 'Mutual Fund', 'Bond', 'ETF', 'Commodity'] },
                    { name: 'entity_name', label: 'Entity Name', type: 'text' },
                    { name: 'value', label: 'Current Value', type: 'number', step: '0.01' },
                    { name: 'at_price', label: 'Purchase Price', type: 'number', step: '0.01' },
                    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Sold', 'Hold'] },
                    { name: 'profit_loss', label: 'Profit/Loss', type: 'number', step: '0.01' },
                    { name: 'filter_name', label: 'Filter Name', type: 'text' }
                ]
            },
            policies: {
                name: "Insurance Policies",
                icon: "🛡️",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'name', label: 'Policy Name', type: 'text', required: true },
                    { name: 'insured_person_name', label: 'Insured Person', type: 'text' },
                    { name: 'service_provider', label: 'Service Provider', type: 'text' },
                    { name: 'policy_name', label: 'Policy Product Name', type: 'text' },
                    { name: 'insurance_type', label: 'Insurance Type', type: 'select', options: ['Life', 'Health', 'Medical', 'Car', 'Bike', 'Home', 'Travel', 'Personal Accident', 'Critical Illness', 'Child Plan', 'Retirement', 'ULIP', 'Other'] },
                    { name: 'login_id', label: 'Login ID', type: 'text' },
                    { name: 'password', label: 'Password', type: 'password' },
                    { name: 'policy_number', label: 'Policy Number', type: 'text' },
                    { name: 'nominees', label: 'Nominees', type: 'text' },
                    { name: 'relation_with_nominees', label: 'Relation with Nominees', type: 'text' },
                    { name: 'nominees_share_percent', label: 'Nominees Share %', type: 'number', step: '0.01' },
                    { name: 'premium_mode', label: 'Premium Mode', type: 'select', options: ['Monthly', 'Quarterly', 'Half-yearly', 'Annual'] },
                    { name: 'policy_start_date', label: 'Policy Start Date', type: 'date' },
                    { name: 'policy_last_payment_date', label: 'Last Payment Date', type: 'date' },
                    { name: 'date_of_maturity', label: 'Maturity Date', type: 'date' },
                    { name: 'policy_status', label: 'Policy Status', type: 'select', options: ['Active', 'Lapsed', 'Matured', 'Surrendered'] },
                    { name: 'maturity_status', label: 'Maturity Status', type: 'select', options: ['Pending', 'Matured', 'Not Applicable'] },
                    { name: 'premium_paying_term', label: 'Premium Paying Term', type: 'text' },
                    { name: 'premium_amount', label: 'Premium Amount', type: 'number', step: '0.01' },
                    { name: 'total_premium_amount', label: 'Total Premium Amount', type: 'number', step: '0.01' },
                    { name: 'death_sum_assured', label: 'Death Sum Assured', type: 'number', step: '0.01' },
                    { name: 'sum_insured', label: 'Sum Insured', type: 'number', step: '0.01' },
                    { name: 'bonus_or_additional', label: 'Bonus/Additional', type: 'number', step: '0.01' },
                    { name: 'other_documents', label: 'Other Documents', type: 'textarea' }
                ]
            },

            loans: {
                name: "Loans",
                icon: "💰",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'name', label: 'Loan Name', type: 'text', required: true },
                    { name: 'borrower_name', label: 'Borrower Name', type: 'text', required: true },
                    { name: 'lender_name', label: 'Lender Name', type: 'text', required: true },
                    { name: 'loan_type', label: 'Loan Type', type: 'select', options: ['Personal', 'Home', 'Vehicle', 'Education', 'Business', 'Property', 'Other'] },
                    { name: 'loan_amount', label: 'Loan Amount', type: 'number', step: '0.01', required: true },
                    { name: 'interest_rate', label: 'Interest Rate (%)', type: 'number', step: '0.01' },
                    { name: 'loan_term_years', label: 'Loan Term (Years)', type: 'number' },
                    { name: 'loan_term_months', label: 'Loan Term (Months)', type: 'number' },
                    { name: 'emi_amount', label: 'EMI Amount', type: 'number', step: '0.01' },
                    { name: 'loan_start_date', label: 'Loan Start Date', type: 'date', required: true },
                    { name: 'loan_end_date', label: 'Loan End Date', type: 'date' },
                    { name: 'next_payment_date', label: 'Next Payment Date', type: 'date' },
                    { name: 'loan_status', label: 'Loan Status', type: 'select', options: ['Active', 'Closed', 'Overdue', 'Pending'], required: true },
                    { name: 'collateral', label: 'Collateral', type: 'textarea' },
                    { name: 'purpose', label: 'Purpose', type: 'textarea' },
                    { name: 'guarantor', label: 'Guarantor', type: 'text' },
                    { name: 'account_number', label: 'Account Number', type: 'text' },
                    { name: 'bank_branch', label: 'Bank Branch', type: 'text' },
                    { name: 'contact_person', label: 'Contact Person', type: 'text' },
                    { name: 'contact_number', label: 'Contact Number', type: 'tel' },
                    { name: 'email', label: 'Email', type: 'email' },
                    { name: 'notes', label: 'Notes', type: 'textarea' }
                ]
            },

            income_sheet: {
                name: "Income Sheet",
                icon: "📊",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'entry_date', label: 'Date', type: 'date', required: true },
                    { name: 'narration', label: 'Narration', type: 'text', required: true },
                    { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
                    { name: 'transaction_type', label: 'Credit/Debit', type: 'select', options: ['Credit', 'Debit'], required: true },
                    { name: 'category', label: 'Category', type: 'select', options: ['Salary', 'Business Income', 'Rental Income', 'Investment Returns', 'Other Income', 'Housing', 'Food', 'Transportation', 'Utilities', 'Healthcare', 'Education', 'Entertainment', 'Shopping', 'Personal Care', 'Insurance', 'Loan EMI', 'Taxes', 'Savings', 'Other Expense'] },
                    { name: 'notes', label: 'Notes', type: 'textarea' }
                ]
            },

            business_info: {
                name: "Business Information",
                icon: "💼",
                fields: [
                    { name: 'family_member_id', label: 'Linked Person', type: 'family_member_select' },
                    { name: 'business_name', label: 'Business Name', type: 'text', required: true },
                    { name: 'business_type', label: 'Business Type', type: 'select', options: ['Sole Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited', 'Other'] },
                    { name: 'registration_number', label: 'Registration Number', type: 'text' },
                    { name: 'gst_number', label: 'GST Number', type: 'text' },
                    { name: 'pan_number', label: 'PAN Number', type: 'text' },
                    { name: 'owner_name', label: 'Owner Name', type: 'text' },
                    { name: 'business_address', label: 'Business Address', type: 'textarea' },
                    { name: 'contact_number', label: 'Contact Number', type: 'tel' },
                    { name: 'email', label: 'Email', type: 'email' },
                    { name: 'website', label: 'Website', type: 'url' },
                    { name: 'established_date', label: 'Established Date', type: 'date' },
                    { name: 'industry', label: 'Industry', type: 'text' },
                    { name: 'annual_revenue', label: 'Annual Revenue', type: 'number', step: '0.01' },
                    { name: 'employee_count', label: 'Employee Count', type: 'number' },
                    { name: 'bank_account', label: 'Bank Account', type: 'text' },
                    { name: 'ifsc_code', label: 'IFSC Code', type: 'text' },
                    { name: 'license_numbers', label: 'License Numbers', type: 'textarea' },
                    { name: 'tax_registration_details', label: 'Tax Registration Details', type: 'textarea' },
                    { name: 'business_description', label: 'Business Description', type: 'textarea' }
                ]
            },

            reminders: {
                name: "Reminders",
                icon: "🔔",
                fields: [
                    { name: 'title', label: 'Title', type: 'text', required: true },
                    { name: 'description', label: 'Description', type: 'textarea' },
                    { name: 'reminder_date', label: 'Reminder Date & Time', type: 'datetime-local' },
                    { name: 'reminder_type', label: 'Reminder Type', type: 'select', options: ['General', 'Payment', 'Renewal', 'Meeting', 'Important'] },
                    { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'] },
                    { name: 'status', label: 'Status', type: 'select', options: ['Pending', 'Completed', 'Cancelled'] },
                    { name: 'related_table', label: 'Related Table', type: 'select', options: ['', 'properties', 'assets', 'banking_details', 'policies', 'stocks', 'business_info'] },
                    { name: 'related_record_id', label: 'Related Record ID', type: 'number' },
                    { name: 'notification_sent', label: 'Notification Sent', type: 'select', options: ['No', 'Yes'] },
                    { name: 'repeat_type', label: 'Repeat Type', type: 'select', options: ['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'] },
                    { name: 'repeat_interval', label: 'Repeat Interval', type: 'number' },
                    { name: 'files', label: 'Attachments', type: 'file', multiple: true, accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt' }
                ]
            },

            cards: {
                name: "Cards",
                icon: "💳",
                fields: [
                    { name: 'family_member_id', label: 'Card Owner', type: 'select', options: [], required: true },
                    { name: 'card_type', label: 'Card Type', type: 'select', options: ['Credit', 'Debit', 'Prepaid', 'Forex'], required: true },
                    { name: 'card_network', label: 'Card Network', type: 'select', options: ['Visa', 'MasterCard', 'Amex', 'Rupay', 'Diners Club'] },
                    { name: 'bank_name', label: 'Bank Name', type: 'text', required: true },
                    { name: 'card_holder_name', label: 'Card Holder Name', type: 'text', required: true },
                    { name: 'card_number', label: 'Card Number', type: 'text', required: true },
                    { name: 'expiry_date', label: 'Expiry Date', type: 'date', required: true },
                    { name: 'cvv', label: 'CVV', type: 'password' },
                    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Blocked', 'Expired', 'Lost', 'Stolen'] },
                    { name: 'daily_limit', label: 'Daily Limit', type: 'number' },
                    { name: 'bill_generation_date', label: 'Bill Generation Date (Day)', type: 'number', min: 1, max: 31 },
                    { name: 'payment_due_date', label: 'Payment Due Date (Day)', type: 'number', min: 1, max: 31 },
                    { name: 'notes', label: 'Notes', type: 'textarea' },
                    { name: 'files', label: 'Card Images/Files', type: 'file', multiple: true, accept: 'image/*,.pdf' }
                ]
            }
        };
    }

    getSampleData() {
        return {
            personal_info: [],
            family_members: [],
            properties: [],
            assets: [],
            banking_details: [],
            stocks: [],
            policies: [],
            loans: [],
            income_sheet: [],
            business_info: [],
            reminders: [],
            cards: []
        };
    }

    initializeEventListeners() {
        console.log('🔧 Setting up event listeners...');

        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);
            });
        });

        // Quick actions from dashboard
        document.querySelectorAll('.action-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const action = card.dataset.action;
                this.handleQuickAction(action);
            });
        });

        // Premium stat cards navigation
        document.querySelectorAll('.stat-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const section = card.dataset.section;
                if (section) {
                    this.showSection(section);
                }
            });
        });

        // Mobile menu
        this.setupEventListener('mobileMenuBtn', 'click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });

        // Theme toggle
        this.setupEventListener('themeToggle', 'click', () => {
            this.toggleTheme();
        });

        // Global search
        this.setupEventListener('globalSearch', 'input', (e) => {
            this.performGlobalSearch(e.target.value);
        });

        // Table controls
        this.setupEventListener('addRecordBtn', 'click', () => {
            this.showRecordForm();
        });

        this.setupEventListener('exportBtn', 'click', () => {
            this.exportData();
        });

        this.setupEventListener('importBtn', 'click', () => {
            const importInput = document.getElementById('importFileInput');
            if (importInput) importInput.click();
        });

        this.setupEventListener('importFileInput', 'change', (e) => {
            this.importData(e.target.files[0]);
        });

        this.setupEventListener('tableSearch', 'input', (e) => {
            this.filterTable(e.target.value);
        });

        // Modal controls
        this.setupEventListener('modalClose', 'click', () => {
            this.closeModal();
        });

        this.setupEventListener('modalOverlay', 'click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeModal();
            }
        });

        this.setupEventListener('cancelBtn', 'click', () => {
            this.closeModal();
        });

        // Confirmation modal
        this.setupEventListener('confirmCancel', 'click', () => {
            this.closeConfirmModal();
        });

        this.setupEventListener('confirmOk', 'click', () => {
            if (this.confirmCallback) {
                this.confirmCallback();
                this.confirmCallback = null;
            }
            this.closeConfirmModal();
        });

        // Form submission - with both submit event and onclick backup
        const recordForm = document.getElementById('recordForm');
        if (recordForm) {
            recordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log('📋 Form submit event triggered');
                this.saveRecord();
            });
            console.log('✓ Form submit event listener added');
        }

        // Also add onclick to save button as backup
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.preventDefault();
                console.log('💾 Save button clicked');
                this.saveRecord();
            };
            console.log('✓ Save button onclick handler added');
        }

        // File upload
        this.initializeFileUpload();

        // Pagination
        this.setupEventListener('firstPage', 'click', () => this.goToPage(1));
        this.setupEventListener('prevPage', 'click', () => this.goToPage(this.currentPage - 1));
        this.setupEventListener('nextPage', 'click', () => this.goToPage(this.currentPage + 1));
        this.setupEventListener('lastPage', 'click', () => {
            const totalPages = Math.ceil(this.filteredData.length / this.recordsPerPage);
            this.goToPage(totalPages);
        });

        // Confirm modal buttons
        this.setupEventListener('confirmOk', 'click', () => {
            console.log('👆 Confirm OK button clicked');
            if (this.confirmCallback) {
                this.confirmCallback();
                this.closeConfirmModal();
            } else {
                console.warn('⚠️ No confirm callback set');
            }
        });
        this.setupEventListener('confirmCancel', 'click', () => {
            console.log('👆 Confirm Cancel button clicked');
            this.closeConfirmModal();
        });

        console.log('✅ Event listeners setup complete');
    }

    setupEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
            console.log(` Event listener set up for ${elementId}:${event}`);
        } else {
            console.warn(` Element not found: ${elementId}`);
        }
    }

    handleQuickAction(action) {
        switch (action) {
            case 'add-personal':
                this.showSection('personal_info');
                setTimeout(() => this.showRecordForm(), 100);
                break;
            case 'add-property':
                this.showSection('properties');
                setTimeout(() => this.showRecordForm(), 100);
                break;
            case 'add-family':
                this.showSection('family_members');
                setTimeout(() => this.showRecordForm(), 100);
                break;
            case 'add-reminder':
                this.showSection('reminders');
                setTimeout(() => this.showRecordForm(), 100);
                break;
            case 'export-data':
                this.exportAllData();
                break;
            case 'import-data':
                const importInput = document.getElementById('importFileInput');
                if (importInput) importInput.click();
                break;
            case 'backup-data':
                this.backupAllData();
                break;
            case 'add-self':
                this.showSection('personal_info');
                setTimeout(() => {
                    this.showRecordForm();
                    // Pre-fill is_self field
                    setTimeout(() => {
                        const isSelfField = document.getElementById('is_self');
                        if (isSelfField) {
                            isSelfField.value = 'Yes';
                        }
                    }, 200);
                }, 100);
                break;
        }
    }

    // COMPLETELY FIXED: File Upload System (from previous solution)
    initializeFileUpload() {
        if (this.fileUploadInitialized) return;

        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('fileInput');

        if (!dropZone || !fileInput) {
            console.warn(' File upload elements not found');
            return;
        }

        console.log('');

        // Remove existing listeners to prevent duplicates
        const newDropZone = dropZone.cloneNode(true);
        dropZone.parentNode.replaceChild(newDropZone, dropZone);

        const newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);

        // Add fresh event listeners
        newDropZone.addEventListener('click', () => {
            console.log(' Drop zone clicked, opening file dialog...');
            newFileInput.click();
        });

        newDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            newDropZone.classList.add('drag-over');
        });

        newDropZone.addEventListener('dragleave', () => {
            newDropZone.classList.remove('drag-over');
        });

        newDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            newDropZone.classList.remove('drag-over');
            console.log(' Files dropped:', e.dataTransfer.files.length);
            this.handleFileUploadFixed(e.dataTransfer.files);
        });

        newFileInput.addEventListener('change', (e) => {
            console.log(' Files selected:', e.target.files.length);
            this.handleFileUploadFixed(e.target.files);
            // Reset file input value
            e.target.value = '';
        });

        this.fileUploadInitialized = true;
        console.log('');
    }

    // COMPLETELY FIXED: File Upload Handler with Immediate Preview Ready (from previous solution)
    handleFileUploadFixed(files) {
        console.log(' Processing file upload:', files.length, 'files');

        const uploadedFilesDiv = document.getElementById('uploadedFiles');
        const filesListDiv = document.getElementById('filesList');

        if (!uploadedFilesDiv || !filesListDiv) {
            console.error(' Upload container elements not found');
            return;
        }

        let successCount = 0;

        Array.from(files).forEach((file, index) => {
            if (this.validateFileFixed(file)) {
                // Create file object with proper structure
                const fileObj = {
                    id: Date.now() + index + Math.random() * 1000, // Unique ID
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified,
                    originalFile: file, // Keep original File object
                    dataUrl: null, // For preview
                    arrayBuffer: null, // For download
                    isReady: false,
                    previewReady: false // NEW: Track preview readiness separately
                };

                // FIXED: Process file with immediate preview for images
                this.processFileForStorageImmediate(file, fileObj).then(() => {
                    // Add to uploaded files array
                    this.uploadedFiles.push(fileObj);

                    // Create and add UI element
                    const fileItem = this.createFileItemFixed(fileObj);
                    filesListDiv.appendChild(fileItem);

                    // Show upload container
                    uploadedFilesDiv.style.display = 'block';

                    successCount++;
                    if (successCount === files.length) {
                        this.showToast(`${files.length} file(s) uploaded successfully`, 'success');
                    }
                }).catch((error) => {
                    console.error(' Error processing file:', file.name, error);
                    this.showToast(`Error processing file: ${file.name}`, 'error');
                });
            }
        });

        // Ensure upload area is always visible
        this.ensureUploadAreaVisibility();
    }

    // FIXED: Immediate File Processing for Preview (from previous solution)
    async processFileForStorageImmediate(file, fileObj) {
        return new Promise((resolve, reject) => {
            console.log(' Processing file for immediate preview:', file.name);

            let readersCompleted = 0;
            const totalReaders = file.type.startsWith('image/') ? 2 : 1; // Images need both dataUrl and ArrayBuffer

            const checkCompletion = () => {
                readersCompleted++;
                if (readersCompleted === totalReaders) {
                    fileObj.isReady = true;
                    console.log(' File completely processed:', file.name);
                    resolve(fileObj);
                }
            };

            // For images - create preview URL IMMEDIATELY
            if (file.type.startsWith('image/')) {
                const readerDataUrl = new FileReader();
                readerDataUrl.onload = (e) => {
                    fileObj.dataUrl = e.target.result;
                    fileObj.previewReady = true; // FIXED: Mark preview as ready immediately
                    console.log(' Image preview ready IMMEDIATELY:', file.name);
                    checkCompletion();
                };
                readerDataUrl.onerror = (e) => {
                    console.error(' Error reading image for preview:', file.name, e);
                    checkCompletion(); // Continue even if preview fails
                };
                readerDataUrl.readAsDataURL(file);
            }

            // For all files - read as ArrayBuffer for proper download
            const readerArrayBuffer = new FileReader();
            readerArrayBuffer.onload = (e) => {
                fileObj.arrayBuffer = e.target.result;
                console.log(' File data ready for download:', file.name);
                checkCompletion();
            };

            readerArrayBuffer.onerror = (e) => {
                console.error(' Error reading file for download:', file.name, e);
                reject(e);
            };

            readerArrayBuffer.readAsArrayBuffer(file);
        });
    }

    // FIXED: File Validation (from previous solution)
    validateFileFixed(file) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'text/plain', 'text/csv'
        ];

        if (file.size > maxSize) {
            this.showToast(`File ${file.name} is too large. Maximum size is 10MB.`, 'error');
            return false;
        }

        if (!allowedTypes.includes(file.type)) {
            this.showToast(`File type ${file.type} is not supported for ${file.name}.`, 'error');
            return false;
        }

        console.log(' File validation passed:', file.name, `(${this.formatFileSize(file.size)})`);
        return true;
    }

    // FIXED: Create File Item UI (from previous solution)
    createFileItemFixed(fileObj) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.setAttribute('data-file-id', fileObj.id);

        const isImage = fileObj.type.startsWith('image/');

        fileItem.innerHTML = `
            <div class="file-info">
                <span class="file-icon">${this.getFileIcon(fileObj.type)}</span>
                <div class="file-details">
                    <div class="file-name" title="${fileObj.name}">${fileObj.name}</div>
                    <div class="file-meta">
                        <span class="file-size">${this.formatFileSize(fileObj.size)}</span>
                        <span class="file-type">${this.getFileTypeDisplay(fileObj.type)}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions">
                ${isImage ? `<button type="button" class="file-action-btn preview-btn" onclick="app.previewImageImmediately(${fileObj.id})" title="Preview Image">🖼️</button>` : ''}
                <button type="button" class="file-action-btn download-btn" onclick="app.downloadFileFixed(${fileObj.id})" title="Download File">⬇️</button>
                <button type="button" class="file-action-btn remove-btn" onclick="app.removeFileFixed(${fileObj.id})" title="Remove File">🗑️</button>
            </div>
        `;

        return fileItem;
    }

    // COMPLETELY FIXED: Immediate Image Preview (No More "Not Ready" Messages) (from previous solution)
    previewImageImmediately(fileId) {
        console.log('🖼️ Previewing image immediately:', fileId);

        const file = this.uploadedFiles.find(f => f.id === fileId);
        if (!file) {
            this.showToast('File not found', 'error');
            return;
        }

        if (!file.type.startsWith('image/')) {
            this.showToast('Preview is only available for images', 'info');
            return;
        }

        // FIXED: Check if preview is ready, if not, retry briefly
        if (!file.dataUrl) {
            console.log('⏳ Preview data not ready yet, waiting briefly...');

            // Show loading message
            this.showToast('Loading image preview...', 'info');

            // Retry after a short delay
            setTimeout(() => {
                if (file.dataUrl) {
                    this.openImagePreviewModal(file);
                } else {
                    // If still not ready after wait, try to re-read the file
                    this.forceCreatePreview(file);
                }
            }, 500);
            return;
        }

        // Open preview immediately if ready
        this.openImagePreviewModal(file);
    }

    // NEW: Force create preview if not ready (from previous solution)
    forceCreatePreview(fileObj) {
        console.log('🔄 Force creating preview for:', fileObj.name);

        if (!fileObj.originalFile) {
            this.showToast('Cannot preview: original file data lost', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            fileObj.dataUrl = e.target.result;
            fileObj.previewReady = true;
            console.log('✅ Force preview creation successful');
            this.openImagePreviewModal(fileObj);
        };
        reader.onerror = () => {
            this.showToast('Failed to create image preview', 'error');
        };
        reader.readAsDataURL(fileObj.originalFile);
    }

    // NEW: Separate method to open preview modal (from previous solution)
    openImagePreviewModal(file) {
        console.log('📷 Opening image preview modal for:', file.name);

        // Create and show preview modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay file-preview-modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal file-preview-container">
                <div class="modal-header">
                    <h3>📷 Image Preview - ${file.name}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="image-preview">
                        <img src="${file.dataUrl}" alt="${file.name}" style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px;">
                    </div>
                    <div class="file-info-preview">
                        <h4>📄 File Information</h4>
                        <p><strong>Name:</strong> ${file.name}</p>
                        <p><strong>Size:</strong> ${this.formatFileSize(file.size)}</p>
                        <p><strong>Type:</strong> ${file.type}</p>
                        <p><strong>Modified:</strong> ${new Date(file.lastModified).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn btn-primary" onclick="app.downloadFileFixed(${file.id}); this.closest('.modal-overlay').remove();">Download</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('✅ Image preview modal opened successfully');
    }

    // FIXED: File Download (from previous solution)
    downloadFileFixed(fileId) {
        console.log('⬇️ Downloading file:', fileId);

        const file = this.uploadedFiles.find(f => f.id === fileId);
        if (!file) {
            this.showToast('File not found', 'error');
            console.error('❌ File not found:', fileId);
            return;
        }

        if (!file.isReady || !file.arrayBuffer) {
            this.showToast('File is still being processed. Please try again in a moment.', 'warning');
            console.warn('⚠️ File not ready for download:', file.name);
            return;
        }

        try {
            console.log('🔄 Creating blob for download:', file.name, file.type);

            // Create blob with correct MIME type
            const blob = new Blob([file.arrayBuffer], { type: file.type });
            console.log('✅ Blob created:', blob.size, 'bytes, type:', blob.type);

            // Create download URL
            const url = URL.createObjectURL(blob);

            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name; // Use original filename
            link.style.display = 'none';

            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up URL
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            console.log('✅ File download initiated:', file.name);
            this.showToast(`Downloaded: ${file.name}`, 'success');

        } catch (error) {
            console.error('❌ Download error:', error);
            this.showToast('Failed to download file: ' + error.message, 'error');
        }
    }

    // FIXED: File Removal (from previous solution)
    removeFileFixed(fileId) {
        console.log('🗑️ Removing file:', fileId);

        // Find and remove file from array
        const fileIndex = this.uploadedFiles.findIndex(f => f.id === fileId);
        if (fileIndex === -1) {
            this.showToast('File not found', 'error');
            return;
        }

        const fileName = this.uploadedFiles[fileIndex].name;
        this.uploadedFiles.splice(fileIndex, 1);

        // Remove UI element
        const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileItem) {
            fileItem.remove();
        }

        // Update UI visibility
        const uploadedFilesDiv = document.getElementById('uploadedFiles');
        if (this.uploadedFiles.length === 0 && uploadedFilesDiv) {
            uploadedFilesDiv.style.display = 'none';
        }

        // Ensure upload area remains visible and functional
        this.ensureUploadAreaVisibility();

        console.log('✅ File removed:', fileName);
        this.showToast(`Removed: ${fileName}`, 'info');
    }

    // FIXED: Upload Area Visibility (from previous solution)
    ensureUploadAreaVisibility() {
        const dropZone = document.getElementById('fileDropZone');
        const fileUploadSection = document.querySelector('.file-upload-section');

        if (dropZone) {
            dropZone.style.display = 'block';
            dropZone.style.opacity = '1';
            dropZone.style.pointerEvents = 'auto';
        }

        if (fileUploadSection) {
            fileUploadSection.style.display = 'block';
        }

        this.renderRecentActivity();
    }

    // FIXED: Preview File from Files Table (from previous solution)
    previewFileFromTable(fileId) {
        console.log('🖼️ Previewing file from table:', fileId);

        const filesData = this.getTableData('files');
        const file = filesData.find(f => f.id == fileId);

        if (!file) {
            this.showToast('File not found', 'error');
            return;
        }

        if (!file.mime_type.startsWith('image/')) {
            this.showToast('Preview is only available for images', 'info');
            return;
        }

        // Create and show preview modal immediately
        const modal = document.createElement('div');
        modal.className = 'modal-overlay file-preview-modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal file-preview-container">
                <div class="modal-header">
                    <h3>📷 Image Preview - ${file.file_name}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="image-preview">
                        <img src="${file.file_path}" alt="${file.file_name}" style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px;" onload="console.log('✅ Image loaded successfully')" onerror="console.error('❌ Image failed to load');">
                    </div>
                    <div class="file-info-preview">
                        <h4>📄 File Information</h4>
                        <p><strong>Name:</strong> ${file.file_name}</p>
                        <p><strong>Size:</strong> ${this.formatFileSize(file.file_size)}</p>
                        <p><strong>Type:</strong> ${file.mime_type}</p>
                        <p><strong>Uploaded:</strong> ${new Date(file.upload_date).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn btn-primary" onclick="(async () => { await app.downloadFileFromTable(${file.id}); })(); this.closest('.modal-overlay').remove();">Download</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('✅ File preview modal opened from table');
    }

    // FIXED: Download File from Entity Table - Updated for new storage
    async downloadFileFromTable(table, recordId, fileId) {
        console.log('📁 Downloading file from entity:', table, recordId, fileId);

        try {
            // Fetch file from new API endpoint
            const response = await fetch(`${this.API_BASE_URL}/files/download/${table}/${recordId}/${fileId}`, {
                headers: {
                    ...(window.dashboardAuth?.token ? { 'Authorization': `Bearer ${window.dashboardAuth.token}` } : {})
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to download: ${response.status}`);
            }

            // Get filename from Content-Disposition header or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'download';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            // Get the blob from response
            const blob = await response.blob();

            // Create download URL
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showToast(`Downloaded: ${filename}`, 'success');
        } catch (error) {
            console.error('❌ Download error:', error);
            this.showToast('Failed to download file: ' + error.message, 'error');
        }
    }

    // FIXED: Delete file from Entity Table - Updated for new storage
    async deleteFileFromTable(table, recordId, fileId) {
        this.showConfirmModal(
            'Delete File',
            'Are you sure you want to delete this file? This action cannot be undone.',
            async () => {
                try {
                    // Delete from new API endpoint
                    await this.apiRequest(`/files/${table}/${recordId}/${fileId}`, 'DELETE');

                    this.showToast('File deleted successfully', 'success');
                    // Refresh the file list modal if open
                    if (this.currentTable && this.currentRecordId) {
                        this.viewFilesForRecord(this.currentTable, this.currentRecordId);
                    }
                } catch (error) {
                    console.error('Delete file error:', error);
                    this.showToast('Failed to delete file: ' + error.message, 'error');
                }
            }
        );
    }

    // Helper Methods (from previous solution)
    getFileIcon(fileType) {
        const iconMap = {
            'application/pdf': '📄',
            'application/msword': '📝',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
            'application/vnd.ms-excel': '📊',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
            'image/jpeg': '🖼️',
            'image/jpg': '🖼️',
            'image/png': '🖼️',
            'image/gif': '🎞️',
            'image/webp': '🖼️',
            'text/plain': '📄',
            'text/csv': '📊'
        };
        return iconMap[fileType] || '📎';
    }

    getFileTypeDisplay(fileType) {
        return fileType.split('/')[1]?.toUpperCase() || 'FILE';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // NEW: Truncate text to max length
    truncateText(text, maxLength) {
        if (text == null) return '';
        const str = String(text);
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-color-scheme', savedTheme);
        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-color-scheme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-color-scheme', newTheme);
        localStorage.setItem('theme', newTheme);

        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        }

        this.showToast(`Switched to ${newTheme} theme`, 'success');
    }

    initializeData() {
        Object.keys(this.tables).forEach(tableName => {
            if (!localStorage.getItem(tableName)) {
                const sampleData = this.sampleData[tableName] || [];
                localStorage.setItem(tableName, JSON.stringify(sampleData));
            }
        });
    }

    showSection(sectionName, options = {}) {
        console.log('📌 Showing section:', sectionName, options);
        this.currentSection = sectionName;
        
        // Store pending member filter if provided
        if (options.memberFilter) {
            this._pendingMemberFilter = options.memberFilter;
            console.log('🔍 Pending member filter set:', options.memberFilter);
        }

        // Update navigation active state
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        // Update page title
        const pageTitle = document.getElementById('pageTitle');

        // Hide all sections
        document.querySelectorAll('.section-content').forEach(section => {
            section.classList.remove('active');
        });

        if (sectionName === 'dashboard') {
            const dashboard = document.getElementById('dashboard');
            if (dashboard) {
                dashboard.classList.add('active');
                if (pageTitle) pageTitle.textContent = 'Main Dashboard';
                if (window.dashboardAuth?.token) {
                    this.updateDashboardStats();
                    this.updateWelcomeStats();
                }
            }
        } else if (sectionName === 'family-tree') {
            this.showFamilyTreeSection();
        } else if (this.tables[sectionName]) {
            this.currentTable = sectionName;
            const tableSection = document.getElementById('tableSection');
            if (tableSection) {
                tableSection.classList.add('active');
                if (pageTitle) pageTitle.textContent = this.tables[sectionName].name;
                this.loadTable(sectionName);
            }
        }

        // Close mobile menu
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    }

    // NEW: Update Welcome Stats with Animation
    updateWelcomeStats() {
        let totalRecords = 0;
        let totalFiles = 0;
        let activeReminders = 0;

        // Calculate totals
        if (!window.dashboardAuth?.token) {
            this.animateCounter('totalRecords', 0);
            this.animateCounter('totalFiles', 0);
            this.animateCounter('activeReminders', 0);
            return;
        }

        this.fetchDashboardStats()
            .then((payload) => {
                const stats = payload?.stats || {};

                totalFiles = stats.files || 0;
                activeReminders = stats.activeReminders || 0;

                // Sum of all data tables (exclude files, reminders meta, and activeReminders)
                for (const [key, value] of Object.entries(stats)) {
                    if (['files', 'activeReminders'].includes(key)) continue;
                    totalRecords += Number(value || 0);
                }

                this.animateCounter('totalRecords', totalRecords);
                this.animateCounter('totalFiles', totalFiles);
                this.animateCounter('activeReminders', activeReminders);
            })
            .catch((e) => {
                console.error('Error updating welcome stats:', e);
                this.animateCounter('totalRecords', 0);
                this.animateCounter('totalFiles', 0);
                this.animateCounter('activeReminders', 0);
            });
    }

    // NEW: Animate Counter with Effects
    animateCounter(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;

        let currentValue = 0;
        const increment = Math.ceil(targetValue / 30);
        const duration = 1500; // 1.5 seconds
        const stepTime = duration / 30;

        const timer = setInterval(() => {
            currentValue += increment;
            if (currentValue >= targetValue) {
                currentValue = targetValue;
                clearInterval(timer);
                // Add completion animation
                element.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    element.style.transform = 'scale(1)';
                }, 200);
            }
            element.textContent = currentValue;
        }, stepTime);
    }

    async loadTable(tableName) {
        console.log('📊 Loading table from PostgreSQL:', tableName);

        const table = this.tables[tableName];
        if (!table) {
            console.error(`❌ Table ${tableName} not found in tables config`);
            this.showToast(`Table ${tableName} not found`, 'error');
            return;
        }

        try {
            // Fetch data from PostgreSQL API
            const data = await this.getTableData(tableName);

            this.filteredData = Array.isArray(data) ? [...data] : [];
            this._originalTableData = [...this.filteredData]; // Store original for filter reset
            this.currentPage = 1;
            
            // Apply pending member filter if set
            if (this._pendingMemberFilter) {
                console.log('🔍 Applying member filter:', this._pendingMemberFilter);
                const normalizedFilter = this._pendingMemberFilter.toLowerCase().trim();
                this.filteredData = this.filteredData.filter(record => {
                    // Check family_member_id or any name-related fields
                    if (record.family_member_id) {
                        // Try to match by family member name (we'll check this below)
                    }
                    // Check all string fields for the name
                    return Object.values(record).some(value => {
                        if (typeof value === 'string') {
                            return value.toLowerCase().includes(normalizedFilter);
                        }
                        return false;
                    });
                });
                // Clear the pending filter after applying
                this._pendingMemberFilter = null;
                console.log(`✅ Filtered to ${this.filteredData.length} records for member`);
            }

            // Update table header
            const tableTitle = document.getElementById('tableTitle');
            const tableDescription = document.getElementById('tableDescription');
            if (tableTitle) tableTitle.textContent = table.name;
            if (tableDescription) tableDescription.textContent = `Manage your ${table.name.toLowerCase()}`;

            // Create table headers
            this.createTableHeaders(table, tableName);

            // Load table data
            await this.renderTableData();

            // Show/hide empty state
            this.toggleEmptyState(this.filteredData.length === 0);

            // Render special visualizations for specific tables
            if (tableName === 'shareholdings') {
                this.renderShareholdingsChart(this.filteredData);
            } else {
                this.clearTableChart();
            }

            console.log(`✅ Loaded ${this.filteredData.length} records from ${tableName}`);
        } catch (error) {
            console.error(`❌ Error loading table ${tableName}:`, error);
            this.showToast(`Failed to load ${table?.name || tableName}`, 'error');
            this.filteredData = [];
            this.toggleEmptyState(true);
        }
    }

    // NEW: Clear generic table chart area
    clearTableChart() {
        const chartContainer = document.getElementById('tableChartContainer');
        if (chartContainer) {
            chartContainer.style.display = 'none';
            chartContainer.innerHTML = '';
        }
    }

    createTableHeaders(table, tableName) {
        const thead = document.getElementById('tableHead');
        if (!thead) return;

        let headers = [];
        let displayFields = [];

        if (tableName === 'files') {
            // FIXED: Specialized headers for Files & Documents
            displayFields = [
                { name: 'record_id', label: 'Record ID' },
                { name: 'record_type', label: 'Record Type' },
                { name: 'file_name', label: 'File Name' },
                { name: 'file_size', label: 'File Size' },
                { name: 'mime_type', label: 'File Type' }
            ];
            headers = ['ID', 'Record ID', 'Record Type', 'File Name', 'File Size', 'File Type', 'Actions'];
        } else if (tableName === 'income_sheet') {
            // Specialized headers for Income Sheet - no ID column, show all relevant fields
            displayFields = [
                { name: 'entry_date', label: 'Date', type: 'date' },
                { name: 'narration', label: 'Narration' },
                { name: 'transaction_type', label: 'Type' },
                { name: 'amount', label: 'Amount', step: '0.01' },
                { name: 'category', label: 'Category' }
            ];
            headers = ['Date', 'Narration', 'Type', 'Amount', 'Category', 'Files', 'Actions'];
        } else if (tableName === 'cards') {
            // Specialized headers for Cards - no ID column
            displayFields = table.fields.slice(0); // Show all fields
            headers = [...displayFields.map(f => f.label), 'Files', 'Actions'];
        } else {
            displayFields = table.fields.slice(0); // Show all fields in table
            headers = ['ID', ...displayFields.map(f => f.label), 'Files', 'Actions'];
        }

        // Store display fields for rendering and filtering
        this.currentDisplayFields = displayFields;
        this.currentTableHeaders = headers;

        // Build header row with filter buttons
        thead.innerHTML = `
            <tr>
                ${headers.map((header, index) => {
            // Don't add filter for Actions or Files column
            if (header === 'Actions' || header === 'Files') {
                return `<th>${header}</th>`;
            }
            // For ID column in non-income_sheet tables
            if (header === 'ID' && tableName !== 'income_sheet') {
                return `<th>${header}</th>`;
            }
            return `<th>
                        <div class="th-content">
                            <span>${header}</span>
                            <button class="filter-btn" onclick="app.showColumnFilter(${index}, '${header}')" title="Filter ${header}">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 3H11M3 3V9M9 3V9M1 9H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </div>
                    </th>`;
        }).join('')}
            </tr>
        `;
    }

    // NEW: Show column filter dropdown
    showColumnFilter(columnIndex, columnName) {
        // Remove any existing filter dropdown
        const existingDropdown = document.querySelector('.column-filter-dropdown');
        if (existingDropdown) existingDropdown.remove();

        // Get unique values for this column from the data
        const field = this.currentDisplayFields?.[columnIndex - (this.currentTable === 'income_sheet' ? 0 : 1)];
        if (!field) return;

        const fieldName = field.name;
        const uniqueValues = [...new Set(this.filteredData.map(row => row[fieldName]).filter(v => v !== null && v !== undefined))].sort();

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'column-filter-dropdown';
        dropdown.innerHTML = `
            <div class="filter-dropdown-header">
                <span>Filter ${columnName}</span>
                <button class="filter-close" onclick="this.closest('.column-filter-dropdown').remove()">×</button>
            </div>
            <div class="filter-search">
                <input type="text" placeholder="Search..." id="filterSearch_${columnIndex}">
            </div>
            <div class="filter-options">
                <label class="filter-option">
                    <input type="checkbox" value="__ALL__" checked onchange="app.toggleAllFilterOptions(this, ${columnIndex})">
                    <span>(Select All)</span>
                </label>
                ${uniqueValues.map(value => {
            const displayValue = String(value || '').substring(0, 50);
            const isChecked = !this.activeFilters?.[fieldName] || this.activeFilters[fieldName].includes(value);
            return `
                        <label class="filter-option">
                            <input type="checkbox" value="${this.escapeHtml(String(value))}" ${isChecked ? 'checked' : ''} onchange="app.applyColumnFilter('${fieldName}')">
                            <span>${this.escapeHtml(displayValue) || '(Empty)'}</span>
                        </label>
                    `;
        }).join('')}
            </div>
            <div class="filter-actions">
                <button class="btn btn-secondary btn-sm" onclick="app.clearColumnFilter('${fieldName}')">Clear</button>
                <button class="btn btn-primary btn-sm" onclick="this.closest('.column-filter-dropdown').remove()">Apply</button>
            </div>
        `;

        // Position dropdown below the header
        const th = document.querySelectorAll('#tableHead th')[columnIndex];
        if (th) {
            const rect = th.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.left = `${rect.left}px`;
            dropdown.style.top = `${rect.bottom + 5}px`;
            dropdown.style.zIndex = '1000';
        }

        document.body.appendChild(dropdown);

        // Add search functionality
        const searchInput = document.getElementById(`filterSearch_${columnIndex}`);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const options = dropdown.querySelectorAll('.filter-option:not(:first-child)');
                options.forEach(option => {
                    const text = option.querySelector('span').textContent.toLowerCase();
                    option.style.display = text.includes(searchTerm) ? 'flex' : 'none';
                });
            });
        }

        // Close dropdown when clicking outside
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!dropdown.contains(e.target) && !e.target.closest('.filter-btn')) {
                    dropdown.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    }

    // Helper: Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // NEW: Toggle all filter options
    toggleAllFilterOptions(selectAllCheckbox, columnIndex) {
        const dropdown = selectAllCheckbox.closest('.column-filter-dropdown');
        const checkboxes = dropdown.querySelectorAll('.filter-option input[type="checkbox"]:not([value="__ALL__"])');
        checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
        this.applyColumnFilterFromDropdown(dropdown);
    }

    // NEW: Apply column filter from dropdown
    applyColumnFilterFromDropdown(dropdown) {
        const checkedValues = [...dropdown.querySelectorAll('.filter-option input[type="checkbox"]:checked:not([value="__ALL__"])')].map(cb => cb.value);
        const fieldName = dropdown.querySelector('.filter-actions button').getAttribute('onclick').match(/'([^']+)'/)[1];

        if (!this.activeFilters) this.activeFilters = {};
        if (checkedValues.length === 0) {
            delete this.activeFilters[fieldName];
        } else {
            this.activeFilters[fieldName] = checkedValues;
        }
        this.applyAllFilters();
    }

    // NEW: Apply column filter
    applyColumnFilter(fieldName) {
        const dropdown = document.querySelector('.column-filter-dropdown');
        this.applyColumnFilterFromDropdown(dropdown);
    }

    // NEW: Clear column filter
    clearColumnFilter(fieldName) {
        if (this.activeFilters) delete this.activeFilters[fieldName];
        const dropdown = document.querySelector('.column-filter-dropdown');
        if (dropdown) dropdown.remove();
        this.applyAllFilters();
        this.showToast(`Cleared filter for ${fieldName}`, 'success');
    }

    // NEW: Apply all active filters
    async applyAllFilters() {
        // Use original data as the base
        const originalData = this._originalTableData || this.filteredData || [];

        let filtered = [...originalData];

        if (this.activeFilters && Object.keys(this.activeFilters).length > 0) {
            Object.entries(this.activeFilters).forEach(([fieldName, allowedValues]) => {
                filtered = filtered.filter(row => allowedValues.includes(String(row[fieldName] || '')));
            });
        }

        this.filteredData = filtered;
        this.currentPage = 1;
        await this.renderTableData();
        this.updatePagination();
    }

    async renderTableData() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        // Safety check for currentTable
        if (!this.currentTable || !this.tables[this.currentTable]) {
            console.warn('⚠️ No current table selected or table not found');
            tbody.innerHTML = '<tr><td colspan="100" class="no-data">No table selected</td></tr>';
            return;
        }

        const startIndex = (this.currentPage - 1) * this.recordsPerPage;
        const endIndex = startIndex + this.recordsPerPage;
        const pageData = this.filteredData.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        if (pageData.length === 0) {
            this.toggleEmptyState(true);
            return;
        }

        this.toggleEmptyState(false);

        // Pre-fetch family members if needed for any table
        let familyMembers = [];
        const needsFamilyData = this.currentDisplayFields?.some(f => f.name === 'family_member_id');
        if (needsFamilyData) {
            try {
                familyMembers = await this.getTableData('family_members') || [];
            } catch (e) {
                console.warn('Failed to load family members:', e);
            }
        }

        pageData.forEach(record => {
            const row = document.createElement('tr');

            if (this.currentTable === 'files') {
                // FIXED: Specialized rendering for Files & Documents with working preview
                row.innerHTML = `
                    <td><span class="record-id">#${record.id || 'N/A'}</span></td>
                    <td>${record.record_id || 'N/A'}</td>
                    <td>${record.record_type || 'N/A'}</td>
                    <td title="${record.file_name || ''}">${this.truncateText(record.file_name || '', 30)}</td>
                    <td>${this.formatFileSize(record.file_size || 0)}</td>
                    <td>${this.getFileTypeDisplay(record.mime_type || '')}</td>
                    <td class="actions-cell">
                        <div class="action-buttons">
                            ${record.mime_type && record.mime_type.startsWith('image/') ?
                        `<button class="action-btn-small view-btn" onclick="app.previewFileFromTable('${record.id}')" title="Preview Image">🖼️</button>` :
                        ''
                    }
                            <button class="action-btn-small download-btn" onclick="(async () => { await app.downloadFileFromTable('${record.id}'); })();" title="Download File">⬇️</button>
                            <button class="action-btn-small delete-btn" onclick="(async () => { await app.deleteFileFromTable('${record.id}'); })();" title="Delete File">🗑️</button>
                        </div>
                    </td>
                `;
            } else if (this.currentTable === 'income_sheet') {
                // Specialized rendering for Income Sheet with color coding for Credit/Debit
                const displayFields = this.currentDisplayFields || [
                    { name: 'entry_date', label: 'Date', type: 'date' },
                    { name: 'narration', label: 'Narration' },
                    { name: 'transaction_type', label: 'Type' },
                    { name: 'amount', label: 'Amount', step: '0.01' },
                    { name: 'category', label: 'Category' }
                ];

                row.innerHTML = `
                    ${displayFields.map(field => {
                    let value = record[field.name] || '';
                    let className = 'cell-content';

                    if (field.type === 'date' && value) {
                        value = new Date(value).toLocaleDateString();
                    } else if (field.type === 'datetime-local' && value) {
                        value = new Date(value).toLocaleString();
                    } else if (typeof value === 'number' && field.step === '0.01') {
                        value = '₹' + value.toLocaleString();
                    }

                    // Add color coding for Credit (green) and Debit (red)
                    if (field.name === 'transaction_type') {
                        if (value === 'Credit') {
                            className = 'cell-content credit-badge';
                            value = '↑ ' + value;
                        } else if (value === 'Debit') {
                            className = 'cell-content debit-badge';
                            value = '↓ ' + value;
                        }
                    }

                    return `<td title="${value}"><span class="${className}">${this.truncateText(value, 40)}</span></td>`;
                }).join('')}
                    <td class="files-cell">
                        <div class="file-actions" id="files-${record.id}">
                            <button class="file-btn upload" onclick="app.uploadFileToRecord('${this.currentTable}', '${record.id}')" title="Upload File">📎</button>
                            <button class="file-btn view" onclick="app.viewFilesForRecord('${this.currentTable}', '${record.id}')" title="View Files">📁</button>
                            <span class="file-count" id="file-count-${record.id}" style="display:none">0</span>
                        </div>
                    </td>
                    <td class="actions-cell">
                        <div class="action-buttons">
                            <button class="action-btn-small view-btn" onclick="app.viewRecord('${record.id}')" title="View Details">👁️</button>
                            <button class="action-btn-small edit-btn" onclick="app.editRecord('${record.id}')" title="Edit Record">✏️</button>
                            <button class="action-btn-small delete-btn" onclick="app.deleteRecord('${record.id}')" title="Delete Record">🗑️</button>
                        </div>
                    </td>
                `;

                // Load file count for this record
                this.loadRecordFiles(this.currentTable, record.id);
            } else if (this.currentTable === 'cards') {
                // Cards rendering - no ID column
                const displayFields = this.currentDisplayFields || [];

                row.innerHTML = `
                    ${displayFields.map(field => {
                    let value = record[field.name] || '';

                    // Show family member name instead of ID
                    if (field.name === 'family_member_id' && value) {
                        const member = familyMembers.find(m => m.id == value);
                        value = member ? `${member.name} (${member.relationship || 'Family'})` : `ID: ${value}`;
                    } else if (field.type === 'date' && value) {
                        value = new Date(value).toLocaleDateString();
                    } else if (field.type === 'datetime-local' && value) {
                        value = new Date(value).toLocaleString();
                    } else if (typeof value === 'number') {
                        if (field.step === '0.01') {
                            value = '₹' + value.toLocaleString();
                        }
                    }

                    return `<td title="${value}"><span class="cell-content">${this.truncateText(value, 40)}</span></td>`;
                }).join('')}
                    <td class="files-cell">
                        <div class="file-actions" id="files-${record.id}">
                            <button class="file-btn upload" onclick="app.uploadFileToRecord('${this.currentTable}', '${record.id}')" title="Upload File">📎</button>
                            <button class="file-btn view" onclick="app.viewFilesForRecord('${this.currentTable}', '${record.id}')" title="View Files">📁</button>
                            <span class="file-count" id="file-count-${record.id}" style="display:none">0</span>
                        </div>
                    </td>
                    <td class="actions-cell">
                        <div class="action-buttons">
                            <button class="action-btn-small view-btn" onclick="app.viewRecord('${record.id}')" title="View Details">👁️</button>
                            <button class="action-btn-small edit-btn" onclick="app.editRecord('${record.id}')" title="Edit Record">✏️</button>
                            <button class="action-btn-small delete-btn" onclick="app.deleteRecord('${record.id}')" title="Delete Record">🗑️</button>
                        </div>
                    </td>
                `;
            } else {
                // Standard rendering for all other tables (personal_info, family_members, etc.)
                const displayFields = this.currentDisplayFields || [];

                row.innerHTML = `
                    <td><span class="record-id">#${record.id || 'N/A'}</span></td>
                    ${displayFields.map(field => {
                    let value = record[field.name] || '';

                    // Show family member name instead of ID
                    if (field.name === 'family_member_id' && value) {
                        const member = familyMembers.find(m => m.id == value);
                        value = member ? `${member.name} (${member.relationship || 'Family'})` : `ID: ${value}`;
                    } else if (field.type === 'date' && value) {
                        value = new Date(value).toLocaleDateString();
                    } else if (field.type === 'datetime-local' && value) {
                        value = new Date(value).toLocaleString();
                    } else if (typeof value === 'number') {
                        if (field.step === '0.01') {
                            value = '₹' + value.toLocaleString();
                        }
                    }

                    return `<td title="${value}"><span class="cell-content">${this.truncateText(value, 40)}</span></td>`;
                }).join('')}
                    <td class="files-cell">
                        <div class="file-actions" id="files-${record.id}">
                            <button class="file-btn upload" onclick="app.uploadFileToRecord('${this.currentTable}', '${record.id}')" title="Upload File">📎</button>
                            <button class="file-btn view" onclick="app.viewFilesForRecord('${this.currentTable}', '${record.id}')" title="View Files">📁</button>
                            <span class="file-count" id="file-count-${record.id}" style="display:none">0</span>
                        </div>
                    </td>
                    <td class="actions-cell">
                        <div class="action-buttons">
                            <button class="action-btn-small view-btn" onclick="app.viewRecord('${record.id}')" title="View Details">👁️</button>
                            <button class="action-btn-small edit-btn" onclick="app.editRecord('${record.id}')" title="Edit Record">✏️</button>
                            <button class="action-btn-small delete-btn" onclick="app.deleteRecord('${record.id}')" title="Delete Record">🗑️</button>
                        </div>
                    </td>
                `;
            }

            tbody.appendChild(row);
        });

        this.updatePagination();
    }

    // NEW: Update pagination controls
    updatePagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.recordsPerPage) || 1;
        const currentPageEl = document.getElementById('currentPage');
        const totalPagesEl = document.getElementById('totalPages');

        if (currentPageEl) currentPageEl.textContent = this.currentPage;
        if (totalPagesEl) totalPagesEl.textContent = totalPages;

        // Update button states
        const firstPageBtn = document.getElementById('firstPage');
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        const lastPageBtn = document.getElementById('lastPage');

        if (firstPageBtn) firstPageBtn.disabled = this.currentPage === 1;
        if (prevPageBtn) prevPageBtn.disabled = this.currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = this.currentPage >= totalPages;
        if (lastPageBtn) lastPageBtn.disabled = this.currentPage >= totalPages;
    }

    // NEW: Go to specific page
    async goToPage(page) {
        const totalPages = Math.ceil(this.filteredData.length / this.recordsPerPage) || 1;

        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        this.currentPage = page;
        await this.renderTableData();
    }

    // NEW: Toggle empty state visibility
    toggleEmptyState(show) {
        const emptyState = document.getElementById('emptyState');
        const tableContainer = document.getElementById('tableContainer');

        if (emptyState) {
            emptyState.style.display = show ? 'flex' : 'none';
        }
        if (tableContainer) {
            tableContainer.style.display = show ? 'none' : 'block';
        }
    }

    // NEW: Simple Shareholdings Bar Chart (Company vs %)
    renderShareholdingsChart(data) {
        const chartContainer = document.getElementById('tableChartContainer');
        if (!chartContainer) return;

        // Group by company: each company can have multiple holders (multiple bars)
        const companyMap = new Map();

        (data || [])
            .filter(item => item && item.shareholding_percent != null && !isNaN(item.shareholding_percent))
            .forEach(item => {
                const holder = (item.holder_name || '').toString().trim();
                const company = (item.company_name || '').toString().trim();
                const percent = Number(item.shareholding_percent);
                if (!company) return;

                if (!companyMap.has(company)) companyMap.set(company, []);
                companyMap.get(company).push({ holder, percent: Number(percent.toFixed(2)) });
            });

        const chartData = Array.from(companyMap.entries()).map(([company, entries]) => ({
            company,
            entries
        }));

        if (chartData.length === 0) {
            chartContainer.style.display = 'block';
            chartContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3>No Shareholding Data</h3>
                    <p>Add shareholding records with Company Name and Shareholding % to see the graph.</p>
                </div>
            `;
            return;
        }

        const maxPercent = Math.max(...chartData.flatMap(g => g.entries.map(e => e.percent)), 0);
        const chartMax = Math.max(100, Math.ceil(maxPercent / 10) * 10);
        const tickCount = 5;
        const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((chartMax / tickCount) * (tickCount - i)));

        chartContainer.style.display = 'block';
        chartContainer.innerHTML = `
            <div class="shareholdings-chart">
                <div class="shareholdings-chart-header">
                    <h3>Shareholding Breakdown</h3>
                    <p>Company vs Shareholding % (stacked by holder)</p>
                </div>

                <div class="shareholdings-chart-frame" style="--bar-count:${chartData.length}">
                    <div class="shareholdings-y-axis">
                        ${ticks.map(t => `<div class="shareholdings-y-tick"><span>${t}%</span></div>`).join('')}
                    </div>

                    <div class="shareholdings-plot">
                        <div class="shareholdings-bars">
                            ${chartData.map((group, groupIndex) => {
            const totalPercent = group.entries.reduce((sum, e) => sum + e.percent, 0);
            const remainingPercent = Math.max(0, 100 - totalPercent);
            const segments = [...group.entries];
            if (remainingPercent > 0.1) {
                segments.push({ holder: 'Others', percent: Number(remainingPercent.toFixed(2)), isOthers: true });
            }
            let accumulatedHeight = 0;
            return `
                                <div class="shareholdings-bar-group">
                                    <div class="shareholdings-x-label">${group.company}</div>
                                    <div class="shareholdings-bar-stacked">
                                        ${segments.map((seg, segIndex) => {
                const isDeepesh = seg.holder.toLowerCase() === 'deepesh';
                const isSpecified = !seg.isOthers && seg.holder.toLowerCase() !== 'others';
                const color = isDeepesh ? '#22c55e' : (isSpecified ? '#b3c4e0ff' : '#eba67cff');
                const segmentHeight = (seg.percent / 100) * 100;
                const bottom = accumulatedHeight;
                accumulatedHeight += segmentHeight;
                const label = `${seg.holder} | ${seg.percent}%`;
                const displayLabel = `${seg.holder} ${seg.percent}%`;
                const showText = segmentHeight >= 12;
                return `
                                            <div class="shareholdings-bar-segment" title="${label}" style="height:${segmentHeight}%; bottom:${bottom}%; background:${color};">
                                                ${showText ? `<span class="shareholdings-segment-label">${displayLabel}</span>` : ''}
                                            </div>
                                        `;
            }).join('')}
                                    </div>
                                </div>
                            `;
        }).join('')}
                        </div>
                    </div>

                    <div class="shareholdings-scrollbar" style="display:none;">
                        <input class="shareholdings-scroll-range" type="range" min="0" value="0" step="1" aria-label="Scroll chart" />
                    </div>
                </div>
            </div>
        `;

        const plot = chartContainer.querySelector('.shareholdings-plot');
        const scrollbar = chartContainer.querySelector('.shareholdings-scrollbar');
        const range = chartContainer.querySelector('.shareholdings-scroll-range');
        if (!plot || !scrollbar || !range) return;

        const syncRangeToPlot = () => {
            const maxScroll = Math.max(0, plot.scrollWidth - plot.clientWidth);
            if (maxScroll <= 0) {
                scrollbar.style.display = 'none';
                range.max = '0';
                range.value = '0';
                return;
            }

            scrollbar.style.display = 'block';
            range.max = String(maxScroll);
            range.value = String(Math.min(maxScroll, Math.max(0, plot.scrollLeft)));
        };

        range.addEventListener('input', () => {
            plot.scrollLeft = Number(range.value) || 0;
        });

        plot.addEventListener('scroll', () => {
            range.value = String(plot.scrollLeft);
        }, { passive: true });

        syncRangeToPlot();
        window.addEventListener('resize', syncRangeToPlot);
    }

    // COMPLETELY NEW: Working Family Tree System
    showFamilyTreeSection() {
        console.log('🌳 Showing Family Tree section...');

        const familyTreeSection = document.getElementById('familyTreeSection');
        const pageTitle = document.getElementById('pageTitle');

        if (pageTitle) pageTitle.textContent = 'Family Tree';

        // Hide all sections and show family tree
        document.querySelectorAll('.section-content').forEach(section => {
            section.classList.remove('active');
        });

        if (familyTreeSection) {
            familyTreeSection.classList.add('active');
            this.renderFamilyTree();
        }
    }

    // COMPLETELY NEW: Render Family Tree with Real Data
    async renderFamilyTree() {
        console.log('🎨 Rendering Family Tree...');

        const familyTreeSection = document.getElementById('familyTreeSection');
        if (!familyTreeSection) return;

        // Get family members data from PostgreSQL
        try {
            const familyData = await this.getTableData('family_members');
            console.log('👥 Family data:', familyData);

            familyTreeSection.innerHTML = `
                <div class="family-tree-header">
                    <div class="family-tree-info">
                        <h2>👨‍👩‍👧‍👦 Family Tree</h2>
                        <p>Visual representation of your family relationships</p>
                    </div>
                    <div class="family-tree-actions">
                        <button class="btn btn-secondary" onclick="app.addSelfToFamily()">
                            <span>👤</span>
                            <span>Add Yourself</span>
                        </button>
                        <button class="btn btn-secondary" onclick="app.showSection('family_members')">
                            <span>👨‍👩‍👧‍👦</span>
                            <span>Manage Members</span>
                        </button>
                        <button class="btn btn-primary" onclick="app.addFamilyMember()">
                            <span>➕</span>
                            <span>Add Member</span>
                        </button>
                    </div>
                </div>

                <div class="family-tree-container">
                    ${familyData.length === 0 ? this.renderEmptyFamilyTree() : this.renderFamilyTreeChart(familyData)}
                </div>

                <div class="family-tree-legend">
                    <h3>🎨 Legend</h3>
                    <div class="legend-items">
                        <div class="legend-item">
                            <span class="legend-color male"></span>
                            <span>Male</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-color female"></span>
                            <span>Female</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-color other"></span>
                            <span>Other</span>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error rendering family tree:', error);
            familyTreeSection.innerHTML = `
                <div class="empty-family-tree">
                    <div class="empty-icon">⚠️</div>
                    <h3>Error Loading Family Data</h3>
                    <p>Failed to load family members from database</p>
                </div>
            `;
        }
    }

    // NEW: Empty Family Tree
    renderEmptyFamilyTree() {
        return `
            <div class="empty-family-tree">
                <div class="empty-icon">🌳</div>
                <h3>No Family Members Found</h3>
                <p>Start building your family tree by adding yourself and your family members</p>
                <div class="empty-actions">
                    <button class="btn btn-primary" onclick="app.addSelfToFamily()">
                        <span>👤</span>
                        <span>Add Yourself First</span>
                    </button>
                    <button class="btn btn-secondary" onclick="app.addFamilyMember()">
                        <span>👨‍👩‍👧‍👦</span>
                        <span>Add Family Member</span>
                    </button>
                </div>
            </div>
        `;
    }

    // NEW: Working Family Tree Chart
    renderFamilyTreeChart(familyData) {
        console.log('📊 Rendering family tree chart with data:', familyData);

        // Group family members by generation/relationship
        const generations = this.organizeFamilyByGeneration(familyData);

        let html = '<div class="family-tree">';

        // Render each generation
        Object.keys(generations).sort().forEach(generation => {
            const members = generations[generation];
            if (members.length > 0) {
                html += `
                    <div class="generation">
                        <h3 class="generation-title">${this.getGenerationTitle(generation)}</h3>
                        <div class="family-members-row">
                            ${members.map(member => this.renderFamilyMemberCard(member)).join('')}
                        </div>
                    </div>
                `;
            }
        });

        html += '</div>';
        return html;
    }

    // NEW: Organize Family by Generation
    organizeFamilyByGeneration(familyData) {
        const generations = {
            '1': [], // Self
            '2': [], // Parents, Spouse
            '3': [], // Grandparents, Siblings
            '4': [], // Children
            '5': []  // Others
        };

        familyData.forEach(member => {
            const relationship = (member.relationship || '').toLowerCase();

            if (relationship === 'self') {
                generations['1'].push(member);
            } else if (['father', 'mother', 'spouse'].includes(relationship)) {
                generations['2'].push(member);
            } else if (['grandfather', 'grandmother', 'brother', 'sister'].includes(relationship)) {
                generations['3'].push(member);
            } else if (['son', 'daughter'].includes(relationship)) {
                generations['4'].push(member);
            } else {
                generations['5'].push(member);
            }
        });

        return generations;
    }

    // NEW: Get Generation Title
    getGenerationTitle(generation) {
        const titles = {
            '1': '👤 You',
            '2': '💑 Parents & Spouse',
            '3': '👴👵 Grandparents & Siblings',
            '4': '👶 Children',
            '5': '👨‍👩‍👧‍👦 Extended Family'
        };
        return titles[generation] || 'Family Members';
    }

    // NEW: Render Family Member Card
    renderFamilyMemberCard(member) {
        const gender = (member.gender || '').toLowerCase();
        const relationship = member.relationship || 'Unknown';
        const age = member.date_of_birth ? this.calculateAge(member.date_of_birth) : 'Unknown';
        const isAlive = member.is_alive !== 'No';

        return `
            <div class="family-member-card ${gender} ${!isAlive ? 'deceased' : ''}" onclick="app.showFamilyMemberDetails(${member.id})" style="cursor: pointer;">
                <div class="member-avatar">
                    ${this.getFamilyMemberIcon(relationship, gender)}
                </div>
                <div class="member-info">
                    <h5>${member.name}</h5>
                    <div class="member-relationship">${relationship}</div>
                    <div class="member-age">Age: ${age}</div>
                    ${member.occupation ? `<div class="member-occupation">${member.occupation}</div>` : ''}
                    ${!isAlive ? '<div class="member-status deceased">🕊️ Deceased</div>' : ''}
                </div>
                <div class="member-actions" onclick="event.stopPropagation();">
                    <button class="action-btn-small view-btn" onclick="app.viewFamilyMember(${member.id})" title="View Details">👁️</button>
                    <button class="action-btn-small edit-btn" onclick="app.editFamilyMember(${member.id})" title="Edit Member">✏️</button>
                    <button class="action-btn-small delete-btn" onclick="app.deleteFamilyMember(${member.id})" title="Remove Member">🗑️</button>
                </div>
            </div>
        `;
    }

    // NEW: Show Family Member Details Modal
    async showFamilyMemberDetails(memberId) {
        console.log('👤 Showing details for family member:', memberId);

        try {
            await this.withLoading(async () => {
                // Fetch member data from API
                const result = await this.apiRequest(`/api/family_members/${memberId}`, 'GET', null, { showLoader: false });
                const member = result.data || result;

                if (!member) {
                    this.showToast('Family member not found', 'error');
                    return;
                }

                const gender = (member.gender || '').toLowerCase();
                const relationship = member.relationship || 'Unknown';
                const age = member.date_of_birth ? this.calculateAge(member.date_of_birth) : 'Unknown';
                const isAlive = member.is_alive !== 'No';

                const linkedData = await this.fetchLinkedMemberData(member.id, member.name, { showLoader: false });

                // Format dates
                const birthDate = member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString() : 'Not specified';
                const deathDate = member.date_of_death ? new Date(member.date_of_death).toLocaleDateString() : null;

                // Create modal content with sections for linked data
                const modalContent = `
                <div class="family-member-details-modal">
                    <div class="member-details-header">
                        <div class="member-details-avatar ${gender}">
                            ${this.getFamilyMemberIcon(relationship, gender)}
                        </div>
                        <div class="member-details-title">
                            <h2>${member.name}</h2>
                            <span class="member-details-relationship">${relationship}</span>
                        </div>
                    </div>
                    
                    <div class="member-details-body">
                        <div class="details-section">
                            <h4>📋 Basic Information</h4>
                            <div class="details-grid">
                                <div class="detail-item">
                                    <span class="detail-label">Gender</span>
                                    <span class="detail-value">${member.gender || 'Not specified'}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Age</span>
                                    <span class="detail-value">${age}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Date of Birth</span>
                                    <span class="detail-value">${birthDate}</span>
                                </div>
                                ${deathDate ? `
                                <div class="detail-item">
                                    <span class="detail-label">Date of Death</span>
                                    <span class="detail-value">${deathDate}</span>
                                </div>
                                ` : ''}
                                <div class="detail-item">
                                    <span class="detail-label">Status</span>
                                    <span class="detail-value">${isAlive ? '✅ Alive' : '🕊️ Deceased'}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${member.occupation ? `
                        <div class="details-section">
                            <h4>💼 Professional</h4>
                            <div class="details-grid">
                                <div class="detail-item full-width">
                                    <span class="detail-label">Occupation</span>
                                    <span class="detail-value">${member.occupation}</span>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${member.contact_number || member.email ? `
                        <div class="details-section">
                            <h4>📞 Contact</h4>
                            <div class="details-grid">
                                ${member.contact_number ? `
                                <div class="detail-item">
                                    <span class="detail-label">Phone</span>
                                    <span class="detail-value">${member.contact_number}</span>
                                </div>
                                ` : ''}
                                ${member.email ? `
                                <div class="detail-item">
                                    <span class="detail-label">Email</span>
                                    <span class="detail-value">${member.email}</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        ` : ''}
                        
                        ${member.address ? `
                        <div class="details-section">
                            <h4>🏦 Address</h4>
                            <div class="details-grid">
                                <div class="detail-item full-width">
                                    <span class="detail-value">${member.address}</span>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${member.notes ? `
                        <div class="details-section">
                            <h4>📝 Notes</h4>
                            <div class="details-grid">
                                <div class="detail-item full-width">
                                    <span class="detail-value notes">${member.notes}</span>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${this.renderLinkedDataSections(linkedData, member.name)}
                    </div>
                    
                    <div class="member-details-actions">
                        <button class="btn btn-secondary" onclick="app.closeFamilyDetailsModal()">Close</button>
                        <button class="btn btn-primary" onclick="app.editFamilyMember(${member.id}); app.closeFamilyDetailsModal();">Edit Member</button>
                    </div>
                </div>
            `;

                // Create and show modal
                this.showFamilyDetailsModal(modalContent);
            }, { text: 'Loading' });

        } catch (error) {
            console.error('Error loading family member details:', error);
            this.showToast('Failed to load member details', 'error');
        }
    }

    // NEW: Show Family Details Modal
    showFamilyDetailsModal(content) {
        // Remove existing modal if any
        const existingModal = document.getElementById('familyDetailsModal');
        if (existingModal) existingModal.remove();

        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'familyDetailsModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content family-details-modal">
                <button class="modal-close" onclick="app.closeFamilyDetailsModal()">&times;</button>
                ${content}
            </div>
        `;

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeFamilyDetailsModal();
        });

        document.body.appendChild(modal);
        document.body.classList.add('modal-open');

        // Animate in
        setTimeout(() => modal.classList.add('show'), 10);
    }

    // NEW: Close Family Details Modal
    closeFamilyDetailsModal() {
        const modal = document.getElementById('familyDetailsModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
                document.body.classList.remove('modal-open');
            }, 300);
        }
    }

    // NEW: Fetch linked data for family member
    async fetchLinkedMemberData(memberId, memberName, { showLoader = true } = {}) {
        console.log('🔗 Fetching linked data for:', memberName);

        const linkedData = {
            properties: [],
            policies: [],
            assets: [],
            banking: [],
            stocks: [],
            shareholdings: [],
            loans: [],
            cards: []
        };

        if (!memberId && !memberName) return linkedData;

        try {
            // Fetch tables sequentially with delays to avoid rate limiting
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            const properties = await this.getTableData('properties', { showLoader });
            await delay(100);
            const policies = await this.getTableData('policies', { showLoader });
            await delay(100);
            const assets = await this.getTableData('assets', { showLoader });
            await delay(100);
            const banking = await this.getTableData('banking_details', { showLoader });
            await delay(100);
            const stocks = await this.getTableData('stocks', { showLoader });
            await delay(100);
            const shareholdings = await this.getTableData('shareholdings', { showLoader });
            await delay(100);
            const loans = await this.getTableData('loans', { showLoader });
            await delay(100);
            const cards = await this.getTableData('cards', { showLoader });

            // Filter by name match (case insensitive)
            const normalizedName = (memberName || '').toLowerCase().trim();
            const normalizedMemberId = memberId ? String(memberId) : '';

            linkedData.properties = (properties || []).filter(p => {
                if (p.family_member_id && normalizedMemberId) return String(p.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (p.property_holder_name || '').toLowerCase().includes(normalizedName) ||
                    (p.owner_user || '').toLowerCase().includes(normalizedName) ||
                    (p.name || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.policies = (policies || []).filter(p => {
                if (p.family_member_id && normalizedMemberId) return String(p.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (p.insured_person_name || '').toLowerCase().includes(normalizedName) ||
                    (p.name || '').toLowerCase().includes(normalizedName) ||
                    (p.nominees || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.assets = (assets || []).filter(a => {
                if (a.family_member_id && normalizedMemberId) return String(a.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (a.name || '').toLowerCase().includes(normalizedName) ||
                    (a.owner_user || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.banking = (banking || []).filter(b => {
                if (b.family_member_id && normalizedMemberId) return String(b.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (b.account_holder || '').toLowerCase().includes(normalizedName) ||
                    (b.name || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.stocks = (stocks || []).filter(s => {
                if (s.family_member_id && normalizedMemberId) return String(s.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (s.name || '').toLowerCase().includes(normalizedName) ||
                    (s.entity_name || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.shareholdings = (shareholdings || []).filter(sh => {
                if (sh.family_member_id && normalizedMemberId) return String(sh.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (sh.holder_name || '').toLowerCase().includes(normalizedName) ||
                    (sh.name || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.loans = (loans || []).filter(l => {
                if (l.family_member_id && normalizedMemberId) return String(l.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (l.borrower_name || '').toLowerCase().includes(normalizedName) ||
                    (l.lender_name || '').toLowerCase().includes(normalizedName) ||
                    (l.name || '').toLowerCase().includes(normalizedName) ||
                    (l.guarantor || '').toLowerCase().includes(normalizedName)
                );
            });

            linkedData.cards = (cards || []).filter(c => {
                if (c.family_member_id && normalizedMemberId) return String(c.family_member_id) === normalizedMemberId;
                return normalizedName && (
                    (c.card_holder_name || '').toLowerCase().includes(normalizedName)
                );
            });

            console.log('🔗 Linked data found:', {
                properties: linkedData.properties.length,
                policies: linkedData.policies.length,
                assets: linkedData.assets.length,
                banking: linkedData.banking.length,
                stocks: linkedData.stocks.length,
                shareholdings: linkedData.shareholdings.length,
                loans: linkedData.loans.length,
                cards: linkedData.cards.length
            });

        } catch (error) {
            console.error('Error fetching linked data:', error);
        }

        return linkedData;
    }

    // NEW: Format currency helper
    formatCurrency(value) {
        if (!value || isNaN(value)) return '0';
        const num = parseFloat(value);
        if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
        if (num >= 100000) return (num / 100000).toFixed(2) + ' Lakh';
        if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
        return num.toFixed(2);
    }

    // NEW: Render linked data sections
    renderLinkedDataSections(linkedData, memberName) {
        console.log('🎨 Rendering linked data sections for:', memberName, linkedData);
        const sections = [];

        // Count total items for debugging
        const counts = {
            properties: linkedData.properties?.length || 0,
            policies: linkedData.policies?.length || 0,
            assets: linkedData.assets?.length || 0,
            banking: linkedData.banking?.length || 0,
            loans: linkedData.loans?.length || 0,
            cards: linkedData.cards?.length || 0
        };
        console.log('📊 Linked data counts:', counts);

        // Properties Section
        if (linkedData.properties && linkedData.properties.length > 0) {
            const totalValue = linkedData.properties.reduce((sum, p) => sum + (parseFloat(p.property_value) || 0), 0);
            sections.push(`
                <div class="details-section linked-section">
                    <h4>🏦 Properties (${linkedData.properties.length})</h4>
                    <div class="linked-items">
                        ${linkedData.properties.map(p => `
                            <div class="linked-item" onclick="app.viewRecordByType('properties', '${p.id}')" style="cursor: pointer;">
                                <div class="linked-item-header">
                                    <span class="linked-item-title">${p.name || 'Unnamed Property'}</span>
                                    <span class="linked-item-badge">${p.property_type || 'Property'}</span>
                                </div>
                                <div class="linked-item-details">
                                    ${p.property_address ? `<span class="linked-item-location">📍 ${p.property_address}</span>` : ''}
                                    ${p.property_value ? `<span class="linked-item-value">₹${this.formatCurrency(p.property_value)}</span>` : ''}
                                    ${p.loan_on_property ? '<span class="linked-item-status loan">🏦 Loan Active</span>' : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ${totalValue > 0 ? `<div class="linked-section-total">Total Value: ₹${this.formatCurrency(totalValue)}</div>` : ''}
                </div>
            `);
        }

        // Loans Section
        if (linkedData.loans && linkedData.loans.length > 0) {
            const totalLoanAmount = linkedData.loans.reduce((sum, l) => sum + (parseFloat(l.loan_amount) || 0), 0);
            sections.push(`
                <div class="details-section linked-section">
                    <h4>💰 Loans (${linkedData.loans.length})</h4>
                    <div class="linked-items">
                        ${linkedData.loans.map(l => `
                            <div class="linked-item" onclick="app.viewRecordByType('loans', '${l.id}')" style="cursor: pointer;">
                                <div class="linked-item-header">
                                    <span class="linked-item-title">${l.name || 'Loan'}</span>
                                    <span class="linked-item-badge ${l.loan_status?.toLowerCase()}">${l.loan_status || 'Active'}</span>
                                </div>
                                <div class="linked-item-details">
                                    ${l.borrower_name ? `<span class="linked-item-borrower">👤 ${l.borrower_name}</span>` : ''}
                                    ${l.lender_name ? `<span class="linked-item-lender">🏦 ${l.lender_name}</span>` : ''}
                                    ${l.loan_amount ? `<span class="linked-item-amount">₹${this.formatCurrency(l.loan_amount)}</span>` : ''}
                                    ${l.interest_rate ? `<span class="linked-item-rate">📊 ${l.interest_rate}%</span>` : ''}
                                    ${l.emi_amount ? `<span class="linked-item-emi">💸 EMI: ₹${this.formatCurrency(l.emi_amount)}</span>` : ''}
                                    ${l.loan_end_date ? `<span class="linked-item-maturity">Ends: ${new Date(l.loan_end_date).toLocaleDateString()}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ${totalLoanAmount > 0 ? `<div class="linked-section-total">Total Loan Amount: ₹${this.formatCurrency(totalLoanAmount)}</div>` : ''}
                </div>
            `);
        }

        // Cards Section
        if (linkedData.cards && linkedData.cards.length > 0) {
            sections.push(`
                <div class="details-section linked-section">
                    <h4>💳 Cards (${linkedData.cards.length})</h4>
                    <div class="linked-items">
                        ${linkedData.cards.map(c => `
                            <div class="linked-item" onclick="app.viewRecordByType('cards', '${c.id}')" style="cursor: pointer;">
                                <div class="linked-item-header">
                                    <span class="linked-item-title">${c.card_type || 'Card'} - ${c.card_network || 'Unknown'}</span>
                                    <span class="linked-item-badge ${c.status?.toLowerCase()}">${c.status || 'Active'}</span>
                                </div>
                                <div class="linked-item-details">
                                    ${c.bank_name ? `<span class="linked-item-bank">🏦 ${c.bank_name}</span>` : ''}
                                    ${c.card_holder_name ? `<span class="linked-item-holder">👤 ${c.card_holder_name}</span>` : ''}
                                    ${c.card_number ? `<span class="linked-item-number">🔢 ${c.card_number}</span>` : ''}
                                    ${c.expiry_date ? `<span class="linked-item-expiry">📅 Exp: ${new Date(c.expiry_date).toLocaleDateString()}</span>` : ''}
                                    ${c.daily_limit ? `<span class="linked-item-limit">💳 Limit: ₹${this.formatCurrency(c.daily_limit)}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `);
        }

        // Summary section if any linked data exists
        const totalItems = Object.values(linkedData).reduce((sum, arr) => sum + (arr?.length || 0), 0);
        if (totalItems > 0) {
            sections.unshift(`
                <div class="details-section summary-section-highlight">
                    <h4>📊 Assets Summary</h4>
                    <div class="summary-grid">
                        ${linkedData.properties.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('properties', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Properties"><span class="stat-count">${linkedData.properties.length}</span><span class="stat-label">Properties</span></div>` : ''}
                        ${linkedData.policies.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('policies', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Policies"><span class="stat-count">${linkedData.policies.length}</span><span class="stat-label">Policies</span></div>` : ''}
                        ${linkedData.assets.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('assets', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Assets"><span class="stat-count">${linkedData.assets.length}</span><span class="stat-label">Assets</span></div>` : ''}
                        ${linkedData.banking.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('banking_details', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Bank Accounts"><span class="stat-count">${linkedData.banking.length}</span><span class="stat-label">Bank Accounts</span></div>` : ''}
                        ${linkedData.stocks.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('stocks', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Investments"><span class="stat-count">${linkedData.stocks.length}</span><span class="stat-label">Investments</span></div>` : ''}
                        ${linkedData.shareholdings.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('shareholdings', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Shareholdings"><span class="stat-count">${linkedData.shareholdings.length}</span><span class="stat-label">Shareholdings</span></div>` : ''}
                        ${linkedData.loans.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('loans', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Loans"><span class="stat-count">${linkedData.loans.length}</span><span class="stat-label">Loans</span></div>` : ''}
                        ${linkedData.cards.length ? `<div class="summary-stat clickable" onclick="app.closeFamilyDetailsModal(); app.showSectionWithMemberFilter('cards', '${memberName}')" style="cursor: pointer;" title="View ${memberName}'s Cards"><span class="stat-count">${linkedData.cards.length}</span><span class="stat-label">Cards</span></div>` : ''}
                    </div>
                </div>
            `);
        } else {
            sections.push(`
                <div class="details-section no-linked-data">
                    <div class="no-data-message">
                        <span class="no-data-icon">📭</span>
                        <p>No properties, policies, or assets linked to this person yet.</p>
                        <small>Add records with this person's name to see them here.</small>
                    </div>
                </div>
            `);
        }

        console.log('✅ Generated sections count:', sections.length);
        const html = sections.join('');
        console.log('📝 Generated HTML length:', html.length);
        return html;
    }

    // Helper: Show section with member filter (for inline onclick handlers)
    showSectionWithMemberFilter(sectionName, memberName) {
        console.log('📌 Showing section with member filter:', sectionName, memberName);
        this.showSection(sectionName, { memberFilter: memberName });
    }

    // NEW: View record by type (helper for linked items)
    viewRecordByType(tableName, recordId) {
        alert(`Clicked: ${tableName} ID: ${recordId}`); // Debug alert
        console.log('👁️ Viewing record:', tableName, recordId);
        this.showSection(tableName);
        setTimeout(() => this.viewRecord(recordId), 100);
    }

    // NEW: Calculate Age
    calculateAge(birthDate) {
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }

        return age;
    }

    // NEW: Get Family Member Icon
    getFamilyMemberIcon(relationship, gender) {
        const icons = {
            'self': gender === 'female' ? '👩' : '👨',
            'father': '👨',
            'mother': '👩',
            'spouse': gender === 'female' ? '👩' : '👨',
            'son': '👦',
            'daughter': '👧',
            'brother': '👨',
            'sister': '👩',
            'grandfather': '👴',
            'grandmother': '👵'
        };

        return icons[relationship.toLowerCase()] || (gender === 'female' ? '👩' : '👨');
    }

    // NEW: Add Self to Family
    addSelfToFamily() {
        console.log('👤 Adding self to family...');
        this.showSection('family_members');
        setTimeout(() => {
            this.showRecordForm();
            // Pre-fill relationship as "Self"
            setTimeout(() => {
                const relationshipField = document.getElementById('relationship');
                if (relationshipField) {
                    relationshipField.value = 'Self';
                }
            }, 200);
        }, 100);
    }

    // NEW: Add Family Member
    addFamilyMember() {
        console.log('👨‍👩‍👧‍👦 Adding family member...');
        this.showSection('family_members');
        setTimeout(() => this.showRecordForm(), 100);
    }

    // NEW: View Family Member
    viewFamilyMember(memberId) {
        this.showSection('family_members');
        setTimeout(() => this.viewRecord(memberId), 100);
    }

    // NEW: Edit Family Member  
    editFamilyMember(memberId) {
        this.showSection('family_members');
        setTimeout(() => this.editRecord(memberId), 100);
    }

    async deleteFamilyMember(memberId) {
        this.showConfirmModal(
            'Remove Family Member',
            'Are you sure you want to remove this family member from your tree?',
            async () => {
                try {
                    await this.apiRequest(`/api/family_members/${memberId}`, 'DELETE');

                    this.showToast('Family member removed successfully', 'success');
                    this.renderFamilyTree();
                    this.updateDashboardStats();
                } catch (error) {
                    console.error('Error deleting family member:', error);
                    this.showToast('Failed to remove family member', 'error');
                }
            }
        );
    }

    backupAllData() {
        const allData = {};
        let totalRecords = 0;
    }

    async getTableData(tableName, { showLoader = true } = {}) {
        if (!window.dashboardAuth?.token) {
            return [];
        }
        try {
            // Files table uses different endpoint (/files instead of /api/files)
            const endpoint = tableName === 'files' ? '/files' : `/api/${tableName}`;
            const result = await this.apiRequest(endpoint, 'GET', null, { showLoader });
            return result.data || result.files || [];
        } catch (error) {
            console.error(`Error loading ${tableName} from database:`, error);
            return [];
        }
    }

    async fetchDashboardStats({ force = false } = {}) {
        if (!window.dashboardAuth?.token) return null;

        const now = Date.now();
        const ttlMs = 10_000;
        this._dashboardStatsCache = this._dashboardStatsCache || { ts: 0, value: null, promise: null };

        if (!force && this._dashboardStatsCache.value && (now - this._dashboardStatsCache.ts) < ttlMs) {
            return this._dashboardStatsCache.value;
        }

        if (this._dashboardStatsCache.promise) {
            return this._dashboardStatsCache.promise;
        }

        this._dashboardStatsCache.promise = (async () => {
            const result = await this.apiRequest('/api/dashboard/stats');
            const value = {
                stats: result.stats || {},
                upcomingReminders: Array.isArray(result.upcomingReminders) ? result.upcomingReminders : []
            };
            this._dashboardStatsCache = { ts: Date.now(), value, promise: null };
            return value;
        })().catch((e) => {
            this._dashboardStatsCache.promise = null;
            throw e;
        });

        return this._dashboardStatsCache.promise;
    }

    saveTableData(tableName, data) {
        console.log('saveTableData is deprecated - data is now saved to PostgreSQL automatically');
        return true;
    }

    async updateDashboardStats() {
        try {
            const payload = await this.fetchDashboardStats();
            const stats = payload?.stats || {};

            // Update counts for each table card (these are table names)
            Object.keys(this.tables).forEach(tableName => {
                const countElement = document.getElementById(`${tableName}_count`);
                if (countElement && stats[tableName] !== undefined) {
                    countElement.textContent = stats[tableName];
                }
            });

            // Files count & active reminders (welcome cards)
            const filesCountEl = document.getElementById('files_count');
            if (filesCountEl && stats.files !== undefined) {
                filesCountEl.textContent = stats.files;
            }
        } catch (error) {
            console.error('Error updating dashboard stats:', error);
        }
    }

    async loadExistingFiles(recordId) {
        try {
            // Fetch files from PostgreSQL API
            const result = await this.apiRequest(`/files/record/${this.currentTable}/${recordId}`);
            const recordFiles = result.files || [];

            // Convert file records to uploadedFiles format
            this.uploadedFiles = recordFiles.map(file => ({
                id: file.id,
                name: file.file_name,
                size: file.file_size || 0,
                type: file.mime_type || file.file_type || 'application/octet-stream',
                dataUrl: null, // Will be fetched from API when needed
                previewReady: (file.mime_type || file.file_type || '').startsWith('image/'), // Images are ready
                isReady: true, // Existing files are always ready
                isExisting: true
            }));

            console.log(`✅ Loaded ${recordFiles.length} existing files for record ${recordId}`);
        } catch (error) {
            console.error('❌ Error loading existing files:', error);
            this.uploadedFiles = [];
        }
    }

    async generateFormFields(fields, recordId) {
        const formFields = document.getElementById('formFields');
        if (!formFields) return;

        let record = {};
        if (recordId) {
            const data = await this.getTableData(this.currentTable);
            record = data.find(r => r.id == recordId) || {};
        }

        formFields.innerHTML = fields.map(field => {
            let value = record[field.name] || '';

            // Handle datetime-local format
            if (field.type === 'datetime-local' && value) {
                const date = new Date(value);
                value = date.toISOString().slice(0, 16);
            }

            return `
                            <div class="form-group">
                                <label for="${field.name}" class="form-label">
                                    ${field.label}
                                    ${field.required ? '<span class="required">*</span>' : ''}
                                </label>
                                ${this.generateFieldInput(field, value)}
                                ${field.type === 'password' ? '<small class="field-hint">Password will be encrypted when saved</small>' : ''}
                            </div>
                            `;
        }).join('');

        // Update file upload section
        this.updateFileUploadSection();

        setTimeout(() => {
            this.populateFamilyMemberSelect(record?.family_member_id || '');
        }, 0);
    }

    async populateFamilyMemberSelect(selectedValue) {
        const select = document.getElementById('family_member_id');
        if (!select) return;

        let members = [];
        try {
            members = await this.getTableData('family_members');
        } catch (e) {
            members = [];
        }

        const options = [
            '<option value="">Unlinked / Other</option>',
            ...(members || []).map(m => {
                const rel = m.relationship ? ` (${m.relationship})` : '';
                return `<option value="${m.id}">${m.name || 'Unnamed'}${rel}</option>`;
            })
        ].join('');

        select.innerHTML = options;
        select.value = selectedValue || '';
    }

    updateFileUploadSection() {
        const uploadedFilesDiv = document.getElementById('uploadedFiles');
        const filesListDiv = document.getElementById('filesList');

        // ... existing code ...
    }

    generateFieldInput(field, value) {
        const commonAttrs = `
                            id="${field.name}"
                            name="${field.name}"
                            class="form-input"
                            ${field.required ? 'required' : ''}
                            `;

        switch (field.type) {
            case 'family_member_select':
                return `<select ${commonAttrs}><option value="">Unlinked / Other</option></select>`;
            case 'textarea':
                return `<textarea ${commonAttrs} rows="3">${value}</textarea>`;

            case 'select':
                const options = field.options.map(option =>
                    `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`
                ).join('');
                return `<select ${commonAttrs}><option value="">Select ${field.label}</option>${options}</select>`;

            case 'number':
                return `<input type="number" ${commonAttrs} value="${value}" ${field.step ? `step="${field.step}"` : ''}>`;

            case 'date':
                return `<input type="date" ${commonAttrs} value="${value}">`;

            case 'datetime-local':
                return `<input type="datetime-local" ${commonAttrs} value="${value}">`;

            case 'file':
                const accept = field.accept || '*';
                const multiple = field.multiple ? 'multiple' : '';
                return `
                    <div class="file-upload-wrapper">
                        <input type="file" ${commonAttrs} accept="${accept}" ${multiple} 
                               onchange="window.app.handleFileSelect(this, '${field.name}')">
                        <div class="file-list" id="file-list-${field.name}"></div>
                    </div>
                `;

            default:
                return `<input type="${field.type}" ${commonAttrs} value="${value}">`;
        }
    }

    // Show record form modal (add or edit)
    async showRecordForm(recordId = null) {
        const modalTitle = document.getElementById('modalTitle');
        const form = document.getElementById('recordForm');

        if (recordId) {
            this.editingRecord = recordId;
            this.isEditMode = true;
            if (modalTitle) modalTitle.textContent = 'Edit Record';
            await this.loadRecordIntoForm(recordId);
        } else {
            this.editingRecord = null;
            this.isEditMode = false;
            if (modalTitle) modalTitle.textContent = 'Add New Record';
            if (form) form.reset();
            await this.generateFormFields(this.tables[this.currentTable].fields);
            this.showModal();
        }
    }

    // Load record data into form for editing
    async loadRecordIntoForm(recordId) {
        const table = this.tables[this.currentTable];
        if (!table) return;

        // Find the record in filteredData
        const record = this.filteredData.find(r => r.id == recordId);
        if (!record) {
            console.error('Record not found:', recordId);
            return;
        }

        // Generate form fields with record data (now async)
        await this.generateFormFields(table.fields, recordId);

        // Load existing files if this is a reminder
        if (this.currentTable === 'reminders') {
            const fileField = table.fields.find(f => f.type === 'file');
            if (fileField) {
                await this.loadReminderFiles(recordId, fileField.name);
            }
        }

        // Show the modal
        this.showModal();
    }

    // View record details
    // View record details in a beautiful card-style display
    async viewRecord(recordId) {
        const table = this.tables[this.currentTable];
        if (!table) return;

        // Find the record in filteredData
        const record = this.filteredData.find(r => r.id == recordId);
        if (!record) {
            console.error('Record not found:', recordId);
            return;
        }

        // Get linked family member name if present
        let linkedMemberName = '';
        if (record.family_member_id) {
            try {
                const members = await this.getTableData('family_members');
                const member = members.find(m => m.id == record.family_member_id);
                if (member) linkedMemberName = member.name;
            } catch (e) {
                // ignore
            }
        }

        // Build a beautiful view card
        const viewContent = `
            <div class="record-view-card">
                <div class="record-view-header">
                    <div class="record-view-icon">${table.icon}</div>
                    <div class="record-view-title">
                        <h2>${record.name || record.business_name || record.holder_name || 'Record Details'}</h2>
                        <span class="record-view-type">${table.name}</span>
                    </div>
                    <div class="record-view-actions">
                        <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
                        <button class="btn btn-primary" onclick="app.editRecord('${recordId}')">Edit</button>
                    </div>
                </div>
                
                ${linkedMemberName ? `
                <div class="record-view-section linked-person">
                    <span class="linked-badge">👤 Linked to: ${linkedMemberName}</span>
                </div>
                ` : ''}
                
                <div class="record-view-sections">
                    ${this.renderViewSections(record, table.fields)}
                    ${this.currentTable === 'reminders' && record.files && record.files.length > 0 ? this.renderReminderFiles(record.files) : ''}
                </div>
                
                <div class="record-view-meta">
                    <span>ID: ${record.id}</span>
                    <span>Created: ${record.created_at ? new Date(record.created_at).toLocaleString() : 'N/A'}</span>
                    ${record.updated_at ? `<span>Updated: ${new Date(record.updated_at).toLocaleString()}</span>` : ''}
                </div>
            </div>
        `;

        // Inject the view into the modal
        const modalOverlay = document.getElementById('modalOverlay');
        const modalContent = modalOverlay?.querySelector('.modal-content');
        const formFields = document.getElementById('formFields');
        const modalTitle = document.getElementById('modalTitle');

        if (modalTitle) modalTitle.textContent = 'View Record';
        if (formFields) formFields.innerHTML = viewContent;
        if (modalOverlay) {
            modalOverlay.style.display = 'flex';
            modalOverlay.classList.add('show');
            document.body.classList.add('modal-open');
        }
    }

    // Render view sections for different field groups
    renderViewSections(record, fields) {
        // Group fields by category
        const basicFields = ['name', 'holder_name', 'business_name', 'borrower_name', 'lender_name', 'insured_person_name', 'account_holder', 'property_holder_name', 'owner_user', 'owner_name'];
        const financialFields = ['value', 'current_value', 'purchase_price', 'loan_amount', 'emi_amount', 'premium_amount', 'total_premium_amount', 'sum_insured', 'death_sum_assured', 'shareholding_percent', 'equity_shares', 'annual_revenue', 'interest_rate'];
        const dateFields = ['date_of_birth', 'purchase_date', 'policy_start_date', 'policy_last_payment_date', 'date_of_maturity', 'loan_start_date', 'loan_end_date', 'established_date', 'insurance_expiry_date', 'warranty_expiry_date'];
        const contactFields = ['email', 'phone', 'contact_number', 'mail_id', 'contact_person'];
        const addressFields = ['address', 'property_address', 'business_address', 'current_address', 'permanent_address'];
        const statusFields = ['status', 'loan_status', 'policy_status', 'maturity_status', 'registration_status', 'condition'];
        const idFields = ['aadhar', 'pan_number', 'gst_number', 'registration_number', 'policy_number', 'account_number', 'ifsc_code'];

        const sections = [];

        // Basic Info Section
        const basicData = fields.filter(f => basicFields.some(bf => f.name.toLowerCase().includes(bf.replace('_name', '').toLowerCase())) || f.name === 'name')
            .filter(f => record[f.name]);
        if (basicData.length > 0) {
            sections.push(this.createViewSection('Basic Information', basicData, record, '📋'));
        }

        // Financial Section
        const financialData = fields.filter(f => financialFields.some(ff => f.name.toLowerCase().includes(ff.toLowerCase())))
            .filter(f => record[f.name] != null && record[f.name] !== '');
        if (financialData.length > 0) {
            sections.push(this.createViewSection('Financial Details', financialData, record, '💰'));
        }

        // Contact Section
        const contactData = fields.filter(f => contactFields.some(cf => f.name.toLowerCase().includes(cf.toLowerCase())))
            .filter(f => record[f.name]);
        if (contactData.length > 0) {
            sections.push(this.createViewSection('Contact Information', contactData, record, '📞'));
        }

        // Address Section
        const addressData = fields.filter(f => addressFields.some(af => f.name.toLowerCase().includes(af.toLowerCase())))
            .filter(f => record[f.name]);
        if (addressData.length > 0) {
            sections.push(this.createViewSection('Address Details', addressData, record, '📍'));
        }

        // ID/Documents Section
        const idData = fields.filter(f => idFields.some(idf => f.name.toLowerCase().includes(idf.toLowerCase())))
            .filter(f => record[f.name]);
        if (idData.length > 0) {
            sections.push(this.createViewSection('ID & Documents', idData, record, '📄'));
        }

        // Status Section
        const statusData = fields.filter(f => statusFields.some(sf => f.name.toLowerCase().includes(sf.toLowerCase())))
            .filter(f => record[f.name]);
        if (statusData.length > 0) {
            sections.push(this.createViewSection('Status', statusData, record, '✓'));
        }

        // Dates Section
        const dateData = fields.filter(f => dateFields.some(df => f.name.toLowerCase().includes(df.toLowerCase())) || f.type === 'date')
            .filter(f => record[f.name]);
        if (dateData.length > 0) {
            sections.push(this.createViewSection('Important Dates', dateData, record, '📅'));
        }

        // Other/Remaining fields
        const usedFields = [...basicData, ...financialData, ...contactData, ...addressData, ...idData, ...statusData, ...dateData].map(f => f.name);
        const otherData = fields.filter(f => !usedFields.includes(f.name) && record[f.name] != null && record[f.name] !== '' && !['id', 'user_id', 'family_member_id', 'created_at', 'updated_at'].includes(f.name));
        if (otherData.length > 0) {
            sections.push(this.createViewSection('Additional Information', otherData, record, '📝'));
        }

        return sections.join('');
    }

    createViewSection(title, fields, record, icon) {
        return `
            <div class="record-view-section">
                <h3><span class="section-icon">${icon}</span> ${title}</h3>
                <div class="record-view-grid">
                    ${fields.map(field => {
            let value = record[field.name];
            let displayValue = value || '-';

            // Format based on type
            if (field.type === 'date' && value) {
                displayValue = new Date(value).toLocaleDateString();
            } else if (field.type === 'datetime-local' && value) {
                displayValue = new Date(value).toLocaleString();
            } else if (typeof value === 'number' || field.step === '0.01') {
                if (field.name.toLowerCase().includes('percent') || field.name.toLowerCase().includes('rate')) {
                    displayValue = value + '%';
                } else {
                    displayValue = '₹' + Number(value).toLocaleString('en-IN');
                }
            } else if (field.type === 'textarea') {
                displayValue = value ? value.replace(/\n/g, '<br>') : '-';
                return `<div class="record-view-item full-width"><span class="label">${field.label}</span><span class="value text-block">${displayValue}</span></div>`;
            }

            return `<div class="record-view-item"><span class="label">${field.label}</span><span class="value">${displayValue}</span></div>`;
        }).join('')}
                </div>
            </div>
        `;
    }

    // Render attached files for reminders
    renderReminderFiles(files) {
        if (!files || files.length === 0) return '';

        return `
            <div class="record-view-section reminder-files-section">
                <h3><span class="section-icon">📎</span> Attached Files</h3>
                <div class="reminder-files-list">
                    ${files.map(file => `
                        <div class="reminder-file-item">
                            <span class="file-icon">📄</span>
                            <span class="file-name">${file.original_name}</span>
                            <span class="file-size">(${this.formatFileSize(file.file_size)})</span>
                            <a href="${this.API_BASE_URL}/api/reminders/files/${file.id}/download" 
                               class="download-btn" 
                               target="_blank">Download</a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Edit record
    editRecord(recordId) {
        console.log('✏️ Editing record:', recordId);
        this.showRecordForm(recordId);
    }

    async saveRecord() {
        console.log('💾 saveRecord() called - EDIT MODE:', this.editingRecord ? 'YES' : 'NO');
        console.log('📝 Editing Record ID:', this.editingRecord);
        console.log('📊 isEditMode:', this.isEditMode);
        console.log('🔑 Auth token:', dashboardAuth?.token ? 'Available' : 'Not available');
        console.log('🌐 API URL:', this.API_BASE_URL);
        console.log('📋 Current table:', this.currentTable);

        const form = document.getElementById('recordForm');
        if (!form) {
            console.error('❌ Form not found');
            return;
        }

        // Validate form
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Check if we have a current table selected
        if (!this.currentTable) {
            console.error('❌ No table selected. Cannot save record.');
            this.showToast('Please select a data section first', 'error');
            return;
        }

        const formData = new FormData(form);
        const recordData = {};

        // Convert FormData to object
        for (const [key, value] of formData.entries()) {
            recordData[key] = value;
        }

        console.log('📋 Raw form data keys:', Object.keys(recordData));
        console.log('📋 Raw form data:', recordData);

        // FALLBACK: If FormData is empty, manually collect from inputs
        if (Object.keys(recordData).length === 0) {
            console.warn('⚠️ FormData empty, manually collecting fields...');
            const formFields = document.getElementById('formFields');
            if (formFields) {
                console.log('🔍 formFields HTML:', formFields.innerHTML.substring(0, 500));
                const inputs = formFields.querySelectorAll('input, select, textarea');
                console.log('🔍 Found inputs:', inputs.length);
                inputs.forEach((input, i) => {
                    console.log(`  Input ${i}: name="${input.name}", id="${input.id}", type="${input.type}", value="${input.value?.substring(0, 30)}"`);
                    if (input.name) {
                        recordData[input.name] = input.value;
                    }
                });
                console.log('📋 Manually collected keys:', Object.keys(recordData));
            } else {
                console.error('❌ formFields element not found!');
            }
        }

        // Prevent Postgres type errors: do not send empty strings for optional fields.
        // (e.g. "" for numeric/date columns causes invalid input syntax)
        // BUT keep required fields like 'name' even if empty (server will validate)
        // Fix status case - ensure first letter is capitalized
        if (recordData.status) {
            recordData.status = recordData.status.charAt(0).toUpperCase() + recordData.status.slice(1).toLowerCase();
        }

        // Fix priority case - database expects lowercase
        if (recordData.priority) {
            recordData.priority = recordData.priority.toLowerCase();
        }

        // Remove empty values (except name)
        for (const key of Object.keys(recordData)) {
            if (recordData[key] === '' && key !== 'name') {
                delete recordData[key];
            }
        }

        console.log('📋 Final data to send:', recordData);

        try {
            let result;
            const endpoint = `/api/${this.currentTable}`;

            if (this.editingRecord) {
                // Update existing record
                console.log('🔄 Making PUT request to:', `${endpoint}/${this.editingRecord}`);
                console.log('📦 Request data:', recordData);
                result = await this.apiRequest(`${endpoint}/${this.editingRecord}`, 'PUT', recordData);
                console.log('✅ Update successful:', result);
                this.showToast('Record updated successfully', 'success');
            } else {
                // Create new record
                console.log('🔄 Making POST request to:', endpoint);
                result = await this.apiRequest(endpoint, 'POST', recordData);
                console.log('✅ Create successful:', result);
                this.showToast('Record added successfully', 'success');
            }

            const savedRecordId = result.data?.id || this.editingRecord;

            // Save uploaded files if any (for regular tables)
            if (this.uploadedFiles.length > 0 && savedRecordId) {
                await this.saveUploadedFiles(savedRecordId);
            }

            // Upload reminder files if this is a reminder
            if (this.currentTable === 'reminders' && savedRecordId) {
                await this.uploadReminderFiles(savedRecordId);
            }

            // Log activity for recent activity feed
            this.logActivity(this.editingRecord ?
                `Updated ${this.currentTable.replace('_', ' ')}: ${recordData.name || recordData.holder_name || recordData.business_name || 'Record'}` :
                `Added ${this.currentTable.replace('_', ' ')}: ${recordData.name || recordData.holder_name || recordData.business_name || 'Record'}`
            );
            this.renderRecentActivity();
            this.closeModal();
            this.loadTable(this.currentTable);
            this.updateDashboardStats();
            this.updateWelcomeStats();

            // Refresh upcoming reminders if this is a reminder
            if (this.currentTable === 'reminders') {
                this.loadUpcomingReminders();
            }

            // If we're on family tree and added/edited a family member, refresh the tree
            if (this.currentTable === 'family_members') {
                // Small delay to ensure data is saved
                setTimeout(() => {
                    if (document.getElementById('familyTreeSection').classList.contains('active')) {
                        this.renderFamilyTree();
                    }
                }, 500);
            }

        } catch (error) {
            console.error('Error saving record:', error);
            this.showToast('Failed to save record', 'error');
        }
    }

    async saveUploadedFiles(recordId) {
        if (this.uploadedFiles.length === 0) return;

        // Upload each file to the server
        for (const file of this.uploadedFiles) {
            if (!file.isExisting && file.isReady) {
                try {
                    // Convert file to base64 and upload
                    const base64Data = await this.fileToBase64(file.originalFile || file);

                    await fetch(`${this.API_BASE_URL}/files/upload/${this.currentTable}/${recordId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(window.dashboardAuth?.token ? { 'Authorization': `Bearer ${window.dashboardAuth.token}` } : {})
                        },
                        body: JSON.stringify({
                            name: file.name || (file.originalFile ? file.originalFile.name : 'unnamed'),
                            type: file.type || (file.originalFile ? file.originalFile.type : 'application/octet-stream'),
                            size: file.size || (file.originalFile ? file.originalFile.size : 0),
                            data: base64Data
                        })
                    });
                } catch (error) {
                    console.error('Error uploading file:', error);
                }
            }
        }

        // Clear queue after uploading
        this.uploadedFiles = [];
    }

    async deleteRecord(recordId) {
        console.log('🗑️ Delete requested for record:', recordId, 'in table:', this.currentTable);

        if (!this.currentTable) {
            console.error('❌ No current table set');
            this.showToast('Error: No table selected', 'error');
            return;
        }

        this.showConfirmModal(
            'Delete Record',
            'Are you sure you want to delete this record? This action cannot be undone.',
            async () => {
                console.log('✅ Confirm callback executed, deleting record:', recordId);
                try {
                    await this.apiRequest(`/api/${this.currentTable}/${recordId}`, 'DELETE');

                    this.showToast('Record deleted successfully', 'success');
                    this.loadTable(this.currentTable);
                    this.updateDashboardStats();
                    this.updateWelcomeStats();
                } catch (error) {
                    console.error('Error deleting record:', error);
                    this.showToast('Failed to delete record', 'error');
                }
            }
        );
    }

    manageFiles(recordId) {
        // Open file management for specific record
        this.editRecord(recordId);

        // Focus on file upload section
        setTimeout(() => {
            const fileSection = document.querySelector('.file-upload-section');
            if (fileSection) {
                fileSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                fileSection.style.border = '2px solid var(--primary-color)';
                setTimeout(() => {
                    fileSection.style.border = '';
                }, 2000);
            }
        }, 500);
    }

    showModal() {
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay) {
            modalOverlay.style.display = 'flex';
            modalOverlay.classList.add('show');
            document.body.classList.add('modal-open');

            // Focus first input
            setTimeout(() => {
                const firstInput = modalOverlay.querySelector('.form-input');
                if (firstInput && !firstInput.disabled) {
                    firstInput.focus();
                }
            }, 100);
        }
    }

    closeModal() {
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay) {
            modalOverlay.classList.remove('show');
            modalOverlay.style.display = 'none';
            document.body.classList.remove('modal-open');
        }

        // Reset form state
        this.editingRecord = null;
        this.isEditMode = false;
        this.uploadedFiles = [];
        this.reminderFiles = [];
        this.existingReminderFiles = {};

        // Reset form
        const form = document.getElementById('recordForm');
        if (form) form.reset();

        // Clear uploaded files UI
        const uploadedFiles = document.getElementById('uploadedFiles');
        const filesList = document.getElementById('filesList');
        if (uploadedFiles && filesList) {
            uploadedFiles.style.display = 'none';
            filesList.innerHTML = '';
        }

        // Reset file upload initialization flag
        this.fileUploadInitialized = false;
    }

    showGenericModal(title, contentHtml) {
        const modalTitle = document.getElementById('modalTitle');
        const formFields = document.getElementById('formFields');
        if (modalTitle) modalTitle.textContent = title;
        if (formFields) formFields.innerHTML = contentHtml;
        this.showModal();
    }

    // Show file view modal with custom content
    showFileViewModal(title, content) {
        const modalOverlay = document.getElementById('fileViewModalOverlay');
        const modalTitle = document.getElementById('fileViewModalTitle');
        const modalBody = document.getElementById('fileViewModalBody');

        if (modalOverlay && modalTitle && modalBody) {
            modalTitle.textContent = title;
            modalBody.innerHTML = content;
            modalOverlay.style.display = 'flex';
            modalOverlay.classList.add('show');
            document.body.classList.add('modal-open');
        }
    }

    // Close file view modal
    closeFileViewModal() {
        const modalOverlay = document.getElementById('fileViewModalOverlay');
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
            modalOverlay.classList.remove('show');
            document.body.classList.remove('modal-open');
        }
    }

    showConfirmModal(title, message, callback) {
        console.log('🔔 Showing confirm modal:', title);
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmOverlay = document.getElementById('confirmModalOverlay');

        if (confirmTitle) confirmTitle.textContent = title;
        if (confirmMessage) confirmMessage.textContent = message;

        this.confirmCallback = callback;

        if (confirmOverlay) {
            confirmOverlay.style.display = 'flex';
            confirmOverlay.classList.add('show');
            console.log('✅ Confirm modal displayed');
        } else {
            console.error('❌ confirmModalOverlay element not found!');
        }
    }

    closeConfirmModal() {
        const confirmOverlay = document.getElementById('confirmModalOverlay');
        if (confirmOverlay) {
            confirmOverlay.classList.remove('show');
            confirmOverlay.style.display = 'none';
        }
        this.confirmCallback = null;
    }

    // Handle file selection for reminders
    handleFileSelect(input, fieldName) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        // Store files for upload
        if (!this.reminderFiles) this.reminderFiles = [];

        files.forEach(file => {
            this.reminderFiles.push({
                file: file,
                fieldName: fieldName,
                id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
            });
        });

        // Update UI to show selected files
        this.updateFileListUI(fieldName);
    }

    // Update file list UI
    updateFileListUI(fieldName) {
        const fileListContainer = document.getElementById(`file-list-${fieldName}`);
        if (!fileListContainer || !this.reminderFiles) return;

        const fieldFiles = this.reminderFiles.filter(f => f.fieldName === fieldName);

        if (fieldFiles.length === 0) {
            fileListContainer.innerHTML = '';
            return;
        }

        fileListContainer.innerHTML = fieldFiles.map(fileObj => `
                <div class="selected-file" data-file-id="${fileObj.id}">
                    <span class="file-name">${fileObj.file.name}</span>
                    <span class="file-size">(${this.formatFileSize(fileObj.file.size)})</span>
                    <button type="button" class="remove-file-btn" onclick="window.app.removeReminderFile('${fileObj.id}', '${fieldName}')">×</button>
                </div>
            `).join('');
    }

    // Remove a selected file
    removeReminderFile(fileId, fieldName) {
        if (!this.reminderFiles) return;

        this.reminderFiles = this.reminderFiles.filter(f => f.id !== fileId);
        this.updateFileListUI(fieldName);
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Upload files for a reminder
    async uploadReminderFiles(reminderId) {
        if (!this.reminderFiles || this.reminderFiles.length === 0) return;

        const uploadedFiles = [];

        for (const fileObj of this.reminderFiles) {
            try {
                const formData = new FormData();
                formData.append('file', fileObj.file);

                const response = await fetch(`${this.API_BASE_URL}/api/reminders/${reminderId}/files`, {
                    method: 'POST',
                    headers: {
                        ...(window.dashboardAuth?.token ? { 'Authorization': `Bearer ${window.dashboardAuth.token}` } : {})
                    },
                    body: formData
                });

                if (response.ok) {
                    const result = await response.json();
                    uploadedFiles.push(result.file);
                } else {
                    console.error('Failed to upload file:', fileObj.file.name);
                }
            } catch (error) {
                console.error('Error uploading file:', fileObj.file.name, error);
            }
        }

        // Clear uploaded files
        this.reminderFiles = [];

        return uploadedFiles;
    }

    // Load existing files for a reminder
    async loadReminderFiles(reminderId, fieldName) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/reminders/${reminderId}/files`, {
                headers: {
                    ...(window.dashboardAuth?.token ? { 'Authorization': `Bearer ${window.dashboardAuth.token}` } : {})
                }
            });

            if (!response.ok) return;

            const files = await response.json();

            // Store as existing files
            if (!this.existingReminderFiles) this.existingReminderFiles = {};
            this.existingReminderFiles[reminderId] = files;

            // Update UI
            this.updateExistingFilesUI(files, fieldName, reminderId);
        } catch (error) {
            console.error('Error loading reminder files:', error);
        }
    }

    // Update UI for existing files
    updateExistingFilesUI(files, fieldName, reminderId) {
        const fileListContainer = document.getElementById(`file-list-${fieldName}`);
        if (!fileListContainer) return;

        const existingFilesHTML = files.map(file => `
                <div class="existing-file" data-file-id="${file.id}">
                    <span class="file-icon">📎</span>
                    <span class="file-name">${file.original_name}</span>
                    <span class="file-size">(${this.formatFileSize(file.file_size)})</span>
                    <a href="${this.API_BASE_URL}/api/reminders/files/${file.id}/download" 
                       class="download-file-btn" 
                       target="_blank"
                       title="Download">⬇️</a>
                    <button type="button" 
                            class="remove-file-btn" 
                            onclick="window.app.deleteReminderFile(${file.id}, '${fieldName}', ${reminderId})"
                            title="Delete">×</button>
                </div>
            `).join('');

        // Append to any already selected new files
        const existingHTML = fileListContainer.innerHTML || '';
        fileListContainer.innerHTML = existingHTML + existingFilesHTML;
    }

    // Delete a reminder file
    async deleteReminderFile(fileId, fieldName, reminderId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/reminders/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    ...(window.dashboardAuth?.token ? { 'Authorization': `Bearer ${window.dashboardAuth.token}` } : {})
                }
            });

            if (response.ok) {
                // Remove from UI
                const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
                if (fileElement) fileElement.remove();

                this.showToast('File deleted successfully', 'success');
            } else {
                this.showToast('Failed to delete file', 'error');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            this.showToast('Failed to delete file', 'error');
        }
    }

    async filterTable(searchTerm) {
        if (!this.currentTable) return;

        const allData = this.getTableData(this.currentTable);

        if (!searchTerm) {
            this.filteredData = [...allData];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredData = allData.filter(record => {
                return Object.values(record).some(value =>
                    String(value).toLowerCase().includes(term)
                );
            });
        }

        this.currentPage = 1;
        await this.renderTableData();
    }

    performGlobalSearch(searchTerm) {
        if (!searchTerm.trim()) return;

        console.log('📍 Global search:', searchTerm);

        // For now, just filter current table if one is selected
        if (this.currentTable) {
            this.filterTable(searchTerm);
        }

        this.showToast(`Searching for "${searchTerm}"...`, 'info');
    }

    async exportData() {
        if (!this.currentTable) {
            this.showToast('Please select a data section first', 'error');
            return;
        }

        try {
            // Fetch data from database API
            const result = await this.apiRequest(`/api/${this.currentTable}`);
            const data = result.data || [];
            const table = this.tables[this.currentTable];

            if (data.length === 0) {
                this.showToast('No data to export', 'warning');
                return;
            }

            this.downloadCSV(data, table.name);
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Failed to export data', 'error');
        }
    }

    async exportAllData() {
        const allData = {};
        let totalRecords = 0;

        for (const tableName of Object.keys(this.tables)) {
            try {
                const data = await this.getTableData(tableName);
                allData[tableName] = data;
                totalRecords += data.length;
            } catch (error) {
                console.error(`Error exporting ${tableName}:`, error);
            }
        }

        if (totalRecords === 0) {
            this.showToast('No data to export', 'warning');
            return;
        }

        // Export as JSON
        this.downloadJSON(allData, 'personal-data-backup');
        this.showToast(`Exported ${totalRecords} records from all tables`, 'success');
    }

    downloadCSV(data, filename) {
        if (data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header =>
                `"${String(row[header] || '').replace(/"/g, '""')}"`
            ).join(','))
        ].join('\n');

        this.downloadFile(csvContent, `${filename.replace(/\s+/g, '-')}.csv`, 'text/csv');
        this.showToast(`Exported ${data.length} records to CSV`, 'success');
    }

    downloadJSON(data, filename) {
        const jsonContent = JSON.stringify(data, null, 2);
        this.downloadFile(jsonContent, `${filename}.json`, 'application/json');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    importData(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;

                if (file.name.endsWith('.json')) {
                    this.importJSON(content);
                } else if (file.name.endsWith('.csv')) {
                    this.importCSV(content);
                } else {
                    this.showToast('Unsupported file format. Please use JSON or CSV files.', 'error');
                }
            } catch (error) {
                console.error('Import error:', error);
                this.showToast('Error importing file: ' + error.message, 'error');
            }
        };

        reader.readAsText(file);
    }

    importJSON(content) {
        const data = JSON.parse(content);
        let importedCount = 0;

        Object.keys(data).forEach(tableName => {
            if (this.tables[tableName] && Array.isArray(data[tableName])) {
                this.saveTableData(tableName, data[tableName]);
                importedCount += data[tableName].length;
            }
        });

        this.showToast(`Imported ${importedCount} records successfully`, 'success');
        this.loadTable(this.currentTable);
        this.updateDashboardStats();
        this.updateWelcomeStats();
    }

    importCSV(content) {
        if (!this.currentTable) {
            this.showToast('Please select a data section first', 'error');
            return;
        }

        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            this.showToast('CSV file must have at least a header and one data row', 'error');
            return;
        }

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        const existingData = this.getTableData(this.currentTable);
        const newData = [...existingData];

        let importCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const record = {};

            headers.forEach((header, index) => {
                record[header] = values[index] || '';
            });

            // Assign new ID
            const newId = Math.max(0, ...newData.map(r => r.id || 0)) + 1;
            record.id = newId;
            record.created_at = new Date().toISOString();

            newData.push(record);
            importCount++;
        }

        this.saveTableData(this.currentTable, newData);
        this.showToast(`Imported ${importCount} records from CSV`, 'success');
        this.loadTable(this.currentTable);
        this.updateDashboardStats();
        this.updateWelcomeStats();
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };

        toast.innerHTML = `
                <span class="toast-icon">${icon[type] || icon.info}</span>
                <span class="toast-message">${message}</span>
                <button class="toast-close" onclick="this.parentElement.remove()">×</button>
            `;

        container.appendChild(toast);

        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto hide toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.parentElement.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    // ==========================
    // Recent Activity + Global Search
    // ==========================

    loadActivityLog() {
        // Fetch from database API instead of localStorage
        this.fetchActivityLogs();
        return []; // Will be populated asynchronously
    }

    async fetchActivityLogs() {
        try {
            console.log('🔄 Fetching activity logs from API...');
            const result = await this.apiRequest('/api/activity-logs');
            console.log('📊 Activity logs result:', result);
            
            if (result.success && result.data) {
                this.activityLog = result.data.map(log => ({
                    id: log.id,
                    action: log.action,
                    tableName: log.table_name,
                    recordId: log.record_id,
                    details: log.details,
                    timestamp: log.created_at,
                    ipAddress: log.ip_address,
                    username: log.username || 'Unknown'
                }));
                console.log('✅ Activity logs loaded:', this.activityLog.length, 'items');
                this.renderRecentActivity();
            } else {
                console.warn('⚠️ No activity logs data:', result);
            }
        } catch (error) {
            console.error('❌ Error fetching activity logs:', error);
        }
        return this.activityLog;
    }

    saveActivityLog() {
        localStorage.setItem('recentActivityLog', JSON.stringify(this.activityLog));
    }

    logActivity(msg) {
        this.activityLog.unshift({
            message: msg,
            date: new Date().toLocaleString()
        });
        if (this.activityLog.length > 20) this.activityLog.pop();
        this.saveActivityLog();
    }

    renderRecentActivity() {
        const container = document.getElementById('recentActivityList');
        if (!container) return;

        container.innerHTML = '';
        if (this.activityLog.length === 0) {
            container.innerHTML =
                '<div class="empty-activity">No Recent Activity<br/>Start adding data to see your activity timeline</div>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'activity-list';

        this.activityLog.slice(0, 10).forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.date} - ${item.message}`;
            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    renderSearchResults(results) {
        const container = document.getElementById('searchResults');
        if (!container) return;

        container.innerHTML = '';
        if (results.length === 0) {
            container.innerHTML = '<div class="no-search-results">No results found</div>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'search-results-list';

        results.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `[${item._table}] ${item.name || JSON.stringify(item)}`;
            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    // Upload file to a record - Updated for entity table storage
    async uploadFileToRecord(table, recordId) {
        console.log('📎 Uploading file to record:', table, recordId);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = '*/*';

        fileInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files.length) return;

            this.showToast(`Uploading ${files.length} file(s)...`, 'info');

            for (const file of files) {
                try {
                    // Convert file to base64 and upload
                    const base64Data = await this.fileToBase64(file);

                    await fetch(`${this.API_BASE_URL}/files/upload/${table}/${recordId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(window.dashboardAuth?.token ? { 'Authorization': `Bearer ${window.dashboardAuth.token}` } : {})
                        },
                        body: JSON.stringify({
                            name: file.name,
                            type: file.type || 'application/octet-stream',
                            size: file.size,
                            data: base64Data
                        })
                    });

                    this.showToast(`Uploaded: ${file.name}`, 'success');
                } catch (error) {
                    console.error('Error uploading file:', error);
                    this.showToast(`Failed to upload: ${file.name}`, 'error');
                }
            }

            this.loadRecordFiles(table, recordId);
        };

        fileInput.click();
    }

    // Helper: Convert file to base64
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // View files for a record in modal
    async viewFilesForRecord(table, recordId) {
        try {
            console.log('📂 Fetching files for:', table, recordId);
            const result = await this.apiRequest(`/files/record/${table}/${recordId}`);
            const files = result.files || [];

            if (files.length === 0) {
                this.showToast('No files attached to this record', 'info');
                return;
            }

            const filesHtml = files.map(file => `
                    <div class="file-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-base); margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">${this.getFileIcon(file.file_type || file.type || 'application/octet-stream')}</span>
                            <div>
                                <div style="font-weight: 500;">${file.file_name || file.name}</div>
                                <div style="font-size: 12px; color: var(--color-text-secondary);">${this.formatFileSize(file.file_size || file.size)} • ${file.file_type || file.type || 'Unknown'}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" onclick="app.downloadFileFromTable('${table}', '${recordId}', '${file.id}')" title="Download">⬇️</button>
                            <button class="btn btn-danger" onclick="app.deleteFileFromTable('${table}', '${recordId}', '${file.id}')" title="Delete">🗑️</button>
                        </div>
                    </div>
                `).join('');

            this.showFileViewModal('Files', `
                    <div style="display:flex; flex-direction:column; height:100%; max-height: 520px;">
                        <div style="flex:1; min-height:0; overflow-y:auto; padding-bottom: 12px;">
                            ${filesHtml}
                        </div>
                        <div style="display:flex; gap:12px; justify-content:flex-end; padding-top:16px; border-top: 1px solid var(--color-border); position: sticky; bottom: 0; background: var(--color-surface, #fff);">
                            <button class="btn btn-primary" onclick="app.uploadFileToRecord('${table}', '${recordId}'); app.closeFileViewModal();">📎 Upload New File</button>
                        </div>
                    </div>
                `);
        } catch (error) {
            console.error('Error viewing files:', error);
            this.showToast('Failed to load files', 'error');
        }
    }

    // Get file icon based on mime type
    getFileIcon(mimeType) {
        if (!mimeType) return '📄';
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.includes('pdf')) return '📕';
        if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
        if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
        if (mimeType.includes('text')) return '📃';
        return '📄';
    }

    // Load files for a record and update UI
    async loadRecordFiles(table, recordId) {
        try {
            console.log('📍 Loading files for:', table, recordId);
            const result = await this.apiRequest(`/files/record/${table}/${recordId}`);
            const files = result.files || [];

            const fileCountEl = document.getElementById(`file-count-${recordId}`);

            if (fileCountEl) {
                fileCountEl.textContent = files.length;
                fileCountEl.style.display = files.length > 0 ? 'inline' : 'none';
            }
        } catch (error) {
            console.error('❌ Error loading record files:', error);
        }
    }

    // View all files in the Files section
    async viewAllFiles() {
        try {
            const result = await this.apiRequest('/files');
            const files = result.files || [];

            if (files.length === 0) {
                this.showToast('No files uploaded yet', 'info');
                return;
            }

            const filesHtml = files.map(file => `
                    <div class="file-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-base); margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">${this.getFileIcon(file.mime_type)}</span>
                            <div>
                                <div style="font-weight: 500;">${file.file_name}</div>
                                <div style="font-size: 12px; color: var(--color-text-secondary);">${this.formatFileSize(file.file_size)} • ${file.mime_type} • ${file.record_type || 'General'}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" onclick="app.downloadFileFromTable('${file.id}')" title="Download">⬇️</button>
                            <button class="btn btn-danger" onclick="app.deleteFileFromTable('${file.id}')" title="Delete">🗑️</button>
                        </div>
                    </div>
                `).join('');

            this.showGenericModal('All Files', `
                    <div style="max-height: 500px; overflow-y: auto;">
                        ${filesHtml}
                    </div>
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-border);">
                        <span style="font-size: 14px; color: var(--color-text-secondary);">Total: ${files.length} file(s)</span>
                    </div>
                `);
        } catch (error) {
            console.error('Error viewing all files:', error);
            this.showToast('Failed to load files', 'error');
        }
    }

}   // ✅ end of class DataManager

// Initialize the application
console.log('🚀 Starting Premium Personal Dashboard...');
const app = new DataManager();

// Make app globally available for onclick handlers
window.app = app;

// ==========================
// Connect Search + Render Activity on Load
// ==========================
document.getElementById('searchInput')?.addEventListener('input', e => {
    app.performGlobalSearch(e.target.value);
});

document.addEventListener('DOMContentLoaded', () => {
    app.renderRecentActivity();
});

// ================================================
// LOGIN CREDENTIALS SYSTEM - DATABASE AUTHENTICATION
// ================================================

let dashboardAuth = {
    isLoggedIn: false,
    currentUser: null,
    token: null
};

document.addEventListener('DOMContentLoaded', function () {
    initializeLogin();
});

function initializeLogin() {
    const savedAuth = localStorage.getItem('dashboardAuthState');

    if (savedAuth) {
        try {
            const authData = JSON.parse(savedAuth);
            if (authData.isLoggedIn && authData.currentUser && authData.token) {
                dashboardAuth = authData;
                window.dashboardAuth = dashboardAuth;
                verifyTokenAndShowDashboard();
                return;
            }
        } catch (e) {
            console.warn('Failed to parse saved auth state', e);
        }
    }

    showLoginScreen();
    setupLoginHandlers();
}

async function verifyTokenAndShowDashboard() {
    const apiBaseUrl = typeof window.API_BASE_URL !== 'undefined' ? window.API_BASE_URL : 'http://localhost:3000';

    try {
        const response = await fetch(`${apiBaseUrl}/auth/me`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(dashboardAuth.token ? { 'Authorization': `Bearer ${dashboardAuth.token}` } : {})
            }
        });

        if (response.ok) {
            showDashboard();
            if (window.app) {
                window.app.showSection('dashboard');
                window.app.updateDashboardStats();
                window.app.updateWelcomeStats();
                window.app.loadUpcomingReminders();
            }
        } else {
            dashboardAuth.isLoggedIn = false;
            dashboardAuth.currentUser = null;
            dashboardAuth.token = null;
            window.dashboardAuth = dashboardAuth;
            showLoginScreen();
            setupLoginHandlers();
        }
    } catch (error) {
        console.error('Error verifying auth token:', error);
        showLoginScreen();
        setupLoginHandlers();
    }
}

function setupLoginHandlers() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            handleLogin(e);
        });
    }
}

async function handleLogin(e) {
    e.preventDefault();

    if (window.location.search) {
        const cleanUrl = window.location.href.split('?')[0];
        window.history.replaceState({}, document.title, cleanUrl);
    }

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const messageEl = document.getElementById('loginMessage');

    messageEl.className = 'login-message';
    messageEl.textContent = '';

    try {
        const apiBaseUrl = typeof window.API_BASE_URL !== 'undefined' ? window.API_BASE_URL : 'http://localhost:3000';
        const response = await fetch(`${apiBaseUrl}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            dashboardAuth.isLoggedIn = true;
            dashboardAuth.currentUser = data.user;
            dashboardAuth.token = data.token;

            localStorage.setItem('dashboardAuthState', JSON.stringify(dashboardAuth));

            messageEl.className = 'login-message success';
            messageEl.textContent = 'Login successful! Loading your dashboard...';

            setTimeout(() => {
                showDashboard();
            }, 1200);
        } else {
            messageEl.className = 'login-message error';
            messageEl.textContent = data.error || 'Invalid username or password';
            document.getElementById('loginPassword').value = '';

            setTimeout(() => {
                messageEl.className = 'login-message';
                messageEl.textContent = '';
            }, 4000);
        }
    } catch (error) {
        console.error('Login error:', error);
        messageEl.className = 'login-message error';
        messageEl.textContent = 'Server error. Please try again.';
    }
}

function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    const logoutContainer = document.getElementById('logoutContainer');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    if (logoutContainer) logoutContainer.style.display = 'none';
}

function showDashboard() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    const logoutContainer = document.getElementById('logoutContainer');

    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    if (logoutContainer) logoutContainer.style.display = 'block';

    const userNameEl = document.getElementById('userName');
    if (userNameEl && dashboardAuth?.currentUser?.username) {
        userNameEl.textContent = dashboardAuth.currentUser.username;
    }

    if (window.location.search) {
        const cleanUrl = window.location.href.split('?')[0];
        window.history.replaceState({}, document.title, cleanUrl);
    }

    setTimeout(() => {
        if (window.app && typeof window.app.logActivity === 'function' && dashboardAuth.currentUser) {
            window.app.logActivity(`User ${dashboardAuth.currentUser.username} logged in successfully`);
        }
    }, 1000);
}

function logout() {
    if (window.app && typeof window.app.logActivity === 'function' && dashboardAuth.currentUser) {
        window.app.logActivity(`User ${dashboardAuth.currentUser.username} logged out`);
    }

    dashboardAuth.isLoggedIn = false;
    dashboardAuth.currentUser = null;
    dashboardAuth.token = null;
    if (window.dashboardAuth) {
        window.dashboardAuth.isLoggedIn = false;
        window.dashboardAuth.currentUser = null;
        window.dashboardAuth.token = null;
    }
    localStorage.removeItem('dashboardAuthState');

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.reset();

    showLoginScreen();

    if (window.app && typeof window.app.showSection === 'function') {
        window.app.currentTable = null;
        window.app.showSection('dashboard');
    }
}

window.dashboardAuth = dashboardAuth;
window.logout = logout;

function getCurrentUser() {
    return dashboardAuth.currentUser;
}

function isUserLoggedIn() {
    return dashboardAuth.isLoggedIn;
}

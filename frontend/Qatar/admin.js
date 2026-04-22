const API_BASE_URL = 'http://127.0.0.1:5000/api';
const toast = document.getElementById('toast');
const authShell = document.getElementById('authShell');
const dashboardShell = document.getElementById('dashboardShell');
const opportunitiesGrid = document.getElementById('opportunitiesGrid');
const opportunityCount = document.getElementById('opportunityCount');

document.querySelectorAll('[data-target]').forEach(button => {
    button.addEventListener('click', () => {
        showView(button.dataset.target);
    });
});

document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
document.getElementById('signupForm').addEventListener('submit', handleSignupSubmit);
document.getElementById('opportunityForm').addEventListener('submit', handleOpportunitySubmit);
document.getElementById('refreshBtn').addEventListener('click', async () => {
    try {
        await loadOpportunities();
        showToast('Opportunities refreshed');
    } catch (error) {
        showToast(error.message);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    authShell.classList.remove('hidden');
    dashboardShell.classList.remove('active');
    showView('loginView');
});

function showView(viewId) {
    document.querySelectorAll('.form-view').forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });
    clearFieldErrors();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function setFieldError(id, message) {
    const errorElement = document.getElementById(id);
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(error => {
        error.classList.remove('show');
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function apiRequest(path, options = {}) {
    const response = await fetch(API_BASE_URL + path, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? await response.json()
        : null;

    if (!response.ok) {
        throw new Error(data?.message || 'Request failed. Please try again.');
    }

    return data;
}

function showDashboard(admin) {
    authShell.classList.add('hidden');
    dashboardShell.classList.add('active');

    const fullName = admin?.full_name || 'Admin';
    const email = admin?.email || 'admin@qf.org.qa';
    const initials = fullName
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    document.getElementById('adminName').textContent = fullName;
    document.getElementById('adminEmail').textContent = email;
    document.getElementById('adminAvatar').textContent = initials || 'AD';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeOpportunity(opportunity) {
    const skills = (opportunity.skills_text || '')
        .split(',')
        .map(skill => skill.trim())
        .filter(Boolean);

    return {
        ...opportunity,
        skills,
        applicantsText: opportunity.max_applicants ? `${opportunity.max_applicants} applicants` : 'No applicant cap'
    };
}

function renderOpportunityCard(opportunity) {
    const item = normalizeOpportunity(opportunity);

    return `
        <article class="opportunity-card">
            <div class="opportunity-card-header">
                <h5>${escapeHtml(item.name)}</h5>
                <div class="opportunity-meta">
                    <span>${escapeHtml(item.duration)}</span>
                    <span>${escapeHtml(item.start_date)}</span>
                    <span>${escapeHtml(item.category)}</span>
                </div>
            </div>
            <p class="opportunity-description">${escapeHtml(item.description)}</p>
            <div class="opportunity-skills">
                <div class="opportunity-skills-label">Skills You'll Gain</div>
                <div class="skills-tags">
                    ${item.skills.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join('')}
                </div>
            </div>
            <div class="opportunity-footer">
                <span class="applicants-count">${escapeHtml(item.applicantsText)}</span>
                <span class="applicants-count">${escapeHtml(item.future_opportunities)}</span>
            </div>
        </article>
    `;
}

function renderOpportunities(opportunities) {
    opportunityCount.textContent = opportunities.length;

    if (!opportunities.length) {
        opportunitiesGrid.innerHTML = `
            <div class="empty-state">
                <h4>No opportunities yet</h4>
                <p>Create your first opportunity using the form above.</p>
            </div>
        `;
        return;
    }

    opportunitiesGrid.innerHTML = opportunities
        .map(renderOpportunityCard)
        .join('');
}

async function loadOpportunities() {
    const data = await apiRequest('/opportunities', {
        method: 'GET'
    });
    renderOpportunities(data.opportunities || []);
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    clearFieldErrors();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const rememberMe = document.getElementById('loginRememberMe').checked;

    let valid = true;

    if (!email || !isValidEmail(email)) {
        setFieldError('loginEmailErr', 'Please enter a valid email address.');
        valid = false;
    }

    if (!password) {
        setFieldError('loginPasswordErr', 'Please enter your password.');
        valid = false;
    }

    if (!valid) return;

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                remember_me: rememberMe
            })
        });

        showDashboard(data.admin);
        await loadOpportunities();
        showToast(data.message || 'Login successful');
    } catch (error) {
        showToast(error.message);
    }
}

async function handleSignupSubmit(event) {
    event.preventDefault();
    clearFieldErrors();

    const fullName = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    const confirmPassword = document.getElementById('signupConfirmPassword').value.trim();

    let valid = true;

    if (!fullName) {
        setFieldError('signupNameErr', 'Please enter your full name.');
        valid = false;
    }

    if (!email || !isValidEmail(email)) {
        setFieldError('signupEmailErr', 'Please enter a valid email address.');
        valid = false;
    }

    if (!password || password.length < 8) {
        setFieldError('signupPasswordErr', 'Password must be at least 8 characters.');
        valid = false;
    }

    if (!confirmPassword || password !== confirmPassword) {
        setFieldError('signupConfirmPasswordErr', 'Passwords do not match.');
        valid = false;
    }

    if (!valid) return;

    try {
        const data = await apiRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({
                full_name: fullName,
                email,
                password,
                confirm_password: confirmPassword
            })
        });

        document.getElementById('signupForm').reset();
        showToast(data.message || 'Account created successfully');
        showView('loginView');
    } catch (error) {
        showToast(error.message);
    }
}

async function handleOpportunitySubmit(event) {
    event.preventDefault();

    const payload = {
        name: document.getElementById('oppName').value.trim(),
        duration: document.getElementById('oppDuration').value.trim(),
        start_date: document.getElementById('oppStartDate').value,
        description: document.getElementById('oppDescription').value.trim(),
        skills_text: document.getElementById('oppSkills').value.trim(),
        category: document.getElementById('oppCategory').value,
        future_opportunities: document.getElementById('oppFuture').value.trim(),
        max_applicants: document.getElementById('oppMaxApplicants').value.trim() || null
    };

    if (!payload.name || !payload.duration || !payload.start_date || !payload.description || !payload.skills_text || !payload.category || !payload.future_opportunities) {
        showToast('Please fill all required opportunity fields.');
        return;
    }

    try {
        const data = await apiRequest('/opportunities', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        document.getElementById('opportunityForm').reset();
        await loadOpportunities();
        showToast(data.message || 'Opportunity created successfully');
    } catch (error) {
        showToast(error.message);
    }
}

async function restoreSession() {
    try {
        const data = await apiRequest('/auth/me', {
            method: 'GET'
        });
        showDashboard(data.admin);
        await loadOpportunities();
    } catch (_error) {
        showView('loginView');
    }
}

restoreSession();

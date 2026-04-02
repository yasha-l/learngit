const API_BASE = 'http://localhost:3000/api';

class GitUI {
    constructor() {
        this.currentBranch = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCurrentBranch();
        this.loadBranches();
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
        });

        document.getElementById('refresh-btn').addEventListener('click', () => this.refresh());
        document.getElementById('load-commits').addEventListener('click', () => this.loadCommits());
        document.getElementById('create-branch').addEventListener('click', () => this.createBranch());
        document.getElementById('load-status').addEventListener('click', () => this.loadStatus());
        document.getElementById('load-diff').addEventListener('click', () => this.loadDiff());
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'status') {
            this.loadStatus();
        }
    }

    async refresh() {
        await this.loadCurrentBranch();
        const activeTab = document.querySelector('.nav-item.active').dataset.tab;
        if (activeTab === 'commits') {
            await this.loadCommits();
        } else if (activeTab === 'branches') {
            await this.loadBranches();
        } else if (activeTab === 'status') {
            await this.loadStatus();
        }
        this.showToast('刷新成功', 'success');
    }

    async loadCurrentBranch() {
        try {
            const response = await fetch(`${API_BASE}/branch/current`);
            const data = await response.json();
            if (data.success) {
                this.currentBranch = data.branch;
                document.getElementById('current-branch').textContent = `分支: ${data.branch}`;
            }
        } catch (error) {
            console.error('Error loading current branch:', error);
        }
    }

    async loadCommits() {
        const limit = document.getElementById('commit-limit').value || 20;
        const container = document.getElementById('commits-list');
        container.innerHTML = '<div class="placeholder"><div class="loading"></div> 加载中...</div>';

        try {
            const response = await fetch(`${API_BASE}/commits?limit=${limit}`);
            const data = await response.json();

            if (data.success && data.commits.length > 0) {
                container.innerHTML = data.commits.map(commit => `
                    <div class="commit-item">
                        <div class="commit-hash">${commit.hash}</div>
                        <div class="commit-author">👤 ${commit.author}</div>
                        <div class="commit-date">🕐 ${this.formatDate(commit.date)}</div>
                        <div class="commit-message">${this.escapeHtml(commit.message)}</div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<p class="placeholder">暂无提交记录</p>';
            }
        } catch (error) {
            container.innerHTML = '<p class="placeholder">加载失败，请确保后端服务正在运行</p>';
            this.showToast('加载提交记录失败', 'error');
        }
    }

    async loadBranches() {
        const container = document.getElementById('branches-list');
        container.innerHTML = '<div class="placeholder"><div class="loading"></div> 加载中...</div>';

        try {
            const response = await fetch(`${API_BASE}/branches`);
            const data = await response.json();

            if (data.success && data.branches.length > 0) {
                container.innerHTML = data.branches.map(branch => {
                    const escapedName = this.escapeHtml(branch.name);
                    return `
                    <div class="branch-item ${branch.current ? 'current' : ''}">
                        <div class="branch-name">
                            ${branch.current ? '✓' : '🌿'} ${escapedName}
                        </div>
                        <div class="branch-actions">
                            ${!branch.current ? `
                                <button class="btn btn-secondary" onclick="gitUI.checkoutBranch('${escapedName}')">
                                    切换
                                </button>
                                <button class="btn btn-danger" onclick="gitUI.deleteBranch('${escapedName}')">
                                    删除
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `}).join('');
            } else {
                container.innerHTML = '<p class="placeholder">暂无分支</p>';
            }
        } catch (error) {
            container.innerHTML = '<p class="placeholder">加载失败，请确保后端服务正在运行</p>';
            this.showToast('加载分支列表失败', 'error');
        }
    }

    async createBranch() {
        const name = document.getElementById('new-branch-name').value.trim();
        if (!name) {
            this.showToast('请输入分支名称', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/branch/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('分支创建成功', 'success');
                document.getElementById('new-branch-name').value = '';
                await this.loadBranches();
            } else {
                this.showToast(data.message || '创建分支失败', 'error');
            }
        } catch (error) {
            this.showToast('创建分支失败', 'error');
        }
    }

    async checkoutBranch(name) {
        try {
            const response = await fetch(`${API_BASE}/branch/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('切换分支成功', 'success');
                await this.loadCurrentBranch();
                await this.loadBranches();
            } else {
                this.showToast(data.message || '切换分支失败', 'error');
            }
        } catch (error) {
            this.showToast('切换分支失败', 'error');
        }
    }

    async deleteBranch(name) {
        if (!confirm(`确定要删除分支 "${name}" 吗？`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/branch/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('分支删除成功', 'success');
                await this.loadBranches();
            } else {
                this.showToast(data.message || '删除分支失败', 'error');
            }
        } catch (error) {
            this.showToast('删除分支失败', 'error');
        }
    }

    async loadStatus() {
        const container = document.getElementById('status-content');
        container.innerHTML = '<div class="placeholder"><div class="loading"></div> 加载中...</div>';

        try {
            const response = await fetch(`${API_BASE}/status`);
            const data = await response.json();

            if (data.success) {
                let html = '';

                if (data.status.staged && data.status.staged.length > 0) {
                    html += '<div class="status-group">';
                    html += '<h3>📦 暂存区文件</h3>';
                    html += data.status.staged.map(file => `
                        <div class="file-item">
                            <span class="file-status added">STAGED</span>
                            ${this.escapeHtml(file)}
                        </div>
                    `).join('');
                    html += '</div>';
                }

                if (data.status.modified && data.status.modified.length > 0) {
                    html += '<div class="status-group">';
                    html += '<h3>✏️ 已修改文件</h3>';
                    html += data.status.modified.map(file => `
                        <div class="file-item">
                            <span class="file-status modified">MODIFIED</span>
                            ${this.escapeHtml(file)}
                        </div>
                    `).join('');
                    html += '</div>';
                }

                if (data.status.untracked && data.status.untracked.length > 0) {
                    html += '<div class="status-group">';
                    html += '<h3>❓ 未跟踪文件</h3>';
                    html += data.status.untracked.map(file => `
                        <div class="file-item">
                            <span class="file-status untracked">UNTRACKED</span>
                            ${this.escapeHtml(file)}
                        </div>
                    `).join('');
                    html += '</div>';
                }

                if (data.status.deleted && data.status.deleted.length > 0) {
                    html += '<div class="status-group">';
                    html += '<h3>🗑️ 已删除文件</h3>';
                    html += data.status.deleted.map(file => `
                        <div class="file-item">
                            <span class="file-status deleted">DELETED</span>
                            ${this.escapeHtml(file)}
                        </div>
                    `).join('');
                    html += '</div>';
                }

                container.innerHTML = html || '<p class="placeholder">✅ 工作区干净，没有需要提交的更改</p>';
            }
        } catch (error) {
            container.innerHTML = '<p class="placeholder">加载失败，请确保后端服务正在运行</p>';
            this.showToast('加载状态失败', 'error');
        }
    }

    async loadDiff() {
        const file = document.getElementById('diff-file').value.trim();
        const type = document.getElementById('diff-type').value;
        const container = document.getElementById('diff-content');
        container.innerHTML = '<div class="placeholder"><div class="loading"></div> 加载中...</div>';

        try {
            const params = new URLSearchParams({ type });
            if (file) params.append('file', file);

            const response = await fetch(`${API_BASE}/diff?${params}`);
            const data = await response.json();

            if (data.success && data.diff) {
                const lines = data.diff.split('\n');
                container.innerHTML = lines.map(line => {
                    let className = '';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                        className = 'added';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                        className = 'removed';
                    } else if (line.startsWith('@@') || line.startsWith('diff')) {
                        className = 'header';
                    }
                    return `<div class="diff-line ${className}">${this.escapeHtml(line)}</div>`;
                }).join('');
            } else {
                container.innerHTML = '<p class="placeholder">没有差异内容</p>';
            }
        } catch (error) {
            container.innerHTML = '<p class="placeholder">加载失败，请确保后端服务正在运行</p>';
            this.showToast('加载差异失败', 'error');
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return date.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (days > 0) {
            return `${days} 天前`;
        } else if (hours > 0) {
            return `${hours} 小时前`;
        } else if (minutes > 0) {
            return `${minutes} 分钟前`;
        } else {
            return '刚刚';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

const gitUI = new GitUI();

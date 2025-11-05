const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const cors = require('cors');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const GIT_DIR = process.env.GIT_REPO_PATH || process.cwd();

async function runGitCommand(command) {
    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: GIT_DIR,
            maxBuffer: 1024 * 1024 * 10
        });
        return { success: true, output: stdout || stderr };
    } catch (error) {
        return { success: false, error: error.message, output: error.stdout || error.stderr };
    }
}

app.get('/api/branch/current', async (req, res) => {
    const result = await runGitCommand('git branch --show-current');
    if (result.success) {
        res.json({ success: true, branch: result.output.trim() });
    } else {
        res.json({ success: false, message: 'Failed to get current branch' });
    }
});

app.get('/api/branches', async (req, res) => {
    const result = await runGitCommand('git branch -a');
    if (result.success) {
        const branches = result.output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const current = line.startsWith('*');
                const name = line.replace(/^\*?\s+/, '').replace(/^remotes\//, '');
                return { name, current };
            });
        res.json({ success: true, branches });
    } else {
        res.json({ success: false, branches: [] });
    }
});

app.post('/api/branch/create', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.json({ success: false, message: 'Branch name is required' });
    }
    const result = await runGitCommand(`git branch ${name}`);
    if (result.success) {
        res.json({ success: true, message: 'Branch created successfully' });
    } else {
        res.json({ success: false, message: result.error || result.output });
    }
});

app.post('/api/branch/checkout', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.json({ success: false, message: 'Branch name is required' });
    }
    const result = await runGitCommand(`git checkout ${name}`);
    if (result.success) {
        res.json({ success: true, message: 'Branch checked out successfully' });
    } else {
        res.json({ success: false, message: result.error || result.output });
    }
});

app.post('/api/branch/delete', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.json({ success: false, message: 'Branch name is required' });
    }
    const result = await runGitCommand(`git branch -d ${name}`);
    if (result.success) {
        res.json({ success: true, message: 'Branch deleted successfully' });
    } else {
        const forceResult = await runGitCommand(`git branch -D ${name}`);
        if (forceResult.success) {
            res.json({ success: true, message: 'Branch force deleted successfully' });
        } else {
            res.json({ success: false, message: forceResult.error || forceResult.output });
        }
    }
});

app.get('/api/commits', async (req, res) => {
    const limit = req.query.limit || 20;
    const result = await runGitCommand(
        `git log -${limit} --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso`
    );
    
    if (result.success && result.output) {
        const commits = result.output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [hash, author, email, date, ...messageParts] = line.split('|');
                return {
                    hash: hash.substring(0, 8),
                    fullHash: hash,
                    author: `${author} <${email}>`,
                    date,
                    message: messageParts.join('|')
                };
            });
        res.json({ success: true, commits });
    } else {
        res.json({ success: true, commits: [] });
    }
});

app.get('/api/status', async (req, res) => {
    const result = await runGitCommand('git status --porcelain');
    
    if (result.success) {
        const status = {
            staged: [],
            modified: [],
            untracked: [],
            deleted: []
        };

        if (result.output) {
            result.output.split('\n').forEach(line => {
                if (!line.trim()) return;
                
                const statusCode = line.substring(0, 2);
                const file = line.substring(3);

                if (statusCode.includes('A') || statusCode.includes('M') && statusCode[0] !== ' ') {
                    status.staged.push(file);
                } else if (statusCode.includes('M')) {
                    status.modified.push(file);
                } else if (statusCode.includes('D')) {
                    status.deleted.push(file);
                } else if (statusCode.includes('?')) {
                    status.untracked.push(file);
                }
            });
        }

        res.json({ success: true, status });
    } else {
        res.json({ success: false, status: {} });
    }
});

app.get('/api/diff', async (req, res) => {
    const { type, file } = req.query;
    let command = 'git diff';

    switch (type) {
        case 'staged':
            command = 'git diff --staged';
            break;
        case 'head':
            command = 'git diff HEAD';
            break;
        default:
            command = 'git diff';
    }

    if (file) {
        command += ` -- ${file}`;
    }

    const result = await runGitCommand(command);
    
    if (result.success) {
        res.json({ success: true, diff: result.output });
    } else {
        res.json({ success: false, diff: '' });
    }
});

app.get('/api/log/:file', async (req, res) => {
    const { file } = req.params;
    const limit = req.query.limit || 10;
    const result = await runGitCommand(
        `git log -${limit} --pretty=format:"%H|%an|%ad|%s" --date=short -- ${file}`
    );
    
    if (result.success && result.output) {
        const commits = result.output
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [hash, author, date, ...messageParts] = line.split('|');
                return {
                    hash: hash.substring(0, 8),
                    author,
                    date,
                    message: messageParts.join('|')
                };
            });
        res.json({ success: true, commits });
    } else {
        res.json({ success: true, commits: [] });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', gitDir: GIT_DIR });
});

app.listen(PORT, () => {
    console.log(`🚀 Git API Server running on http://localhost:${PORT}`);
    console.log(`📁 Git repository: ${GIT_DIR}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
});

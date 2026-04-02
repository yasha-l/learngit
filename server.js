const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const cors = require('cors');

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const GIT_DIR = process.env.GIT_REPO_PATH || process.cwd();

function validateBranchName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, message: 'Branch name is required' };
    }
    const branchNameRegex = /^[a-zA-Z0-9._/-]+$/;
    if (!branchNameRegex.test(name)) {
        return { valid: false, message: 'Invalid branch name format. Only alphanumeric characters, dots, underscores, hyphens, and forward slashes are allowed.' };
    }
    if (name.startsWith('-')) {
        return { valid: false, message: 'Branch name cannot start with a hyphen' };
    }
    if (name.includes('..')) {
        return { valid: false, message: 'Branch name cannot contain double dots' };
    }
    if (name.includes('//')) {
        return { valid: false, message: 'Branch name cannot contain consecutive slashes' };
    }
    return { valid: true };
}

function validateFilePath(file) {
    if (!file || typeof file !== 'string') {
        return { valid: false, message: 'File path is required' };
    }
    if (file.includes('..')) {
        return { valid: false, message: 'Invalid file path. Path traversal is not allowed.' };
    }
    if (file.startsWith('/')) {
        return { valid: false, message: 'Invalid file path. Absolute paths are not allowed.' };
    }
    return { valid: true };
}

async function runGitCommandArgs(args) {
    try {
        const { stdout, stderr } = await execFileAsync('git', args, {
            cwd: GIT_DIR,
            maxBuffer: 1024 * 1024 * 10
        });
        return { success: true, output: stdout || stderr };
    } catch (error) {
        return { success: false, error: error.message, output: error.stdout || error.stderr };
    }
}

app.get('/api/branch/current', async (req, res) => {
    const result = await runGitCommandArgs(['branch', '--show-current']);
    if (result.success) {
        res.json({ success: true, branch: result.output.trim() });
    } else {
        res.json({ success: false, message: 'Failed to get current branch' });
    }
});

app.get('/api/branches', async (req, res) => {
    const result = await runGitCommandArgs(['branch', '-a']);
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
    const validation = validateBranchName(name);
    if (!validation.valid) {
        return res.json({ success: false, message: validation.message });
    }
    const result = await runGitCommandArgs(['branch', name]);
    if (result.success) {
        res.json({ success: true, message: 'Branch created successfully' });
    } else {
        res.json({ success: false, message: result.error || result.output });
    }
});

app.post('/api/branch/checkout', async (req, res) => {
    const { name } = req.body;
    const validation = validateBranchName(name);
    if (!validation.valid) {
        return res.json({ success: false, message: validation.message });
    }
    const result = await runGitCommandArgs(['checkout', name]);
    if (result.success) {
        res.json({ success: true, message: 'Branch checked out successfully' });
    } else {
        res.json({ success: false, message: result.error || result.output });
    }
});

app.post('/api/branch/delete', async (req, res) => {
    const { name } = req.body;
    const validation = validateBranchName(name);
    if (!validation.valid) {
        return res.json({ success: false, message: validation.message });
    }
    const result = await runGitCommandArgs(['branch', '-d', name]);
    if (result.success) {
        res.json({ success: true, message: 'Branch deleted successfully' });
    } else {
        const forceResult = await runGitCommandArgs(['branch', '-D', name]);
        if (forceResult.success) {
            res.json({ success: true, message: 'Branch force deleted successfully' });
        } else {
            res.json({ success: false, message: forceResult.error || forceResult.output });
        }
    }
});

app.get('/api/commits', async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    if (limit < 1 || limit > 1000) {
        return res.json({ success: false, message: 'Invalid limit parameter' });
    }
    const result = await runGitCommandArgs([
        'log',
        `-${limit}`,
        '--pretty=format:%H|%an|%ae|%ad|%s',
        '--date=iso'
    ]);
    
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
    const result = await runGitCommandArgs(['status', '--porcelain']);
    
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
    
    const validTypes = ['staged', 'head', ''];
    if (type && !validTypes.includes(type)) {
        return res.json({ success: false, message: 'Invalid diff type' });
    }
    
    if (file) {
        const fileValidation = validateFilePath(file);
        if (!fileValidation.valid) {
            return res.json({ success: false, message: fileValidation.message });
        }
    }
    
    const args = ['diff'];
    if (type === 'staged') {
        args.push('--staged');
    } else if (type === 'head') {
        args.push('HEAD');
    }
    
    if (file) {
        args.push('--', file);
    }

    const result = await runGitCommandArgs(args);
    
    if (result.success) {
        res.json({ success: true, diff: result.output });
    } else {
        res.json({ success: false, diff: '' });
    }
});

app.get('/api/log/:file', async (req, res) => {
    const { file } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    if (limit < 1 || limit > 1000) {
        return res.json({ success: false, message: 'Invalid limit parameter' });
    }
    
    const fileValidation = validateFilePath(file);
    if (!fileValidation.valid) {
        return res.json({ success: false, message: fileValidation.message });
    }
    
    const result = await runGitCommandArgs([
        'log',
        `-${limit}`,
        '--pretty=format:%H|%an|%ad|%s',
        '--date=short',
        '--',
        file
    ]);
    
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

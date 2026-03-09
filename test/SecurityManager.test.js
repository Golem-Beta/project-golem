const assert = require('assert');
const SecurityManager = require('../src/managers/SecurityManager');

function runTests() {
    console.log('🧪 Starting SecurityManager Tests...\n');
    let passed = 0;
    let failed = 0;

    const manager = new SecurityManager();

    // Helper function for running tests
    const test = (name, testFn) => {
        try {
            testFn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err) {
            console.error(`❌ ${name}`);
            console.error(`   ${err.message}`);
            failed++;
        }
    };

    // 1. Built-in safe commands
    test('Should warn on built-in safe commands without whitelist', () => {
        const result = manager.assess('ls -al');
        assert.strictEqual(result.level, 'WARNING', 'ls should be WARNING without whitelist');
        assert.strictEqual(manager.assess('pwd').level, 'WARNING', 'pwd should be WARNING without whitelist');
    });

    // 2. Dangerous commands
    test('Should block destructive commands', () => {
        const result = manager.assess('rm -rf /');
        assert.strictEqual(result.level, 'BLOCKED', 'rm -rf / should be blocked');
    });

    test('Should warn on high risk operations', () => {
        const result = manager.assess('sudo rm my_file.txt');
        assert.strictEqual(result.level, 'DANGER', 'sudo should be flagged as DANGER');
    });

    // 3. Unauthorized commands (not in whitelist)
    test('Should warn on unknown commands (Require Approval)', () => {
        const result = manager.assess('curl http://google.com');
        assert.strictEqual(result.level, 'WARNING', 'curl should require WARNING approval');
    });

    // 4. Custom Whitelist Evaluation
    test('Should allow custom whitelisted commands', () => {
        process.env.COMMAND_WHITELIST = 'curl, docker';
        const result = manager.assess('curl -X GET http://api.example.com');
        assert.strictEqual(result.level, 'SAFE', 'Whitelisted curl should be SAFE');

        const result2 = manager.assess('docker ps');
        assert.strictEqual(result2.level, 'SAFE', 'Whitelisted docker should be SAFE');

        // Clean up
        process.env.COMMAND_WHITELIST = '';
    });

    // 5. Commands with pipelines/redirections
    test('Should warn heavily on pipelines/redirections even if command is whitelisted', () => {
        process.env.COMMAND_WHITELIST = 'ls';
        const subShellResult = manager.assess('echo $(whoami)');
        assert.strictEqual(subShellResult.level, 'WARNING', 'Subshell execution should trigger WARNING');

        const redirectResult = manager.assess('ls > output.txt');
        assert.strictEqual(redirectResult.level, 'WARNING', 'Redirection should trigger WARNING');

        // Clean up
        process.env.COMMAND_WHITELIST = '';
    });

    // 6. Composite commands with whitelist
    test('Should allow composite commands if all are whitelisted', () => {
        process.env.COMMAND_WHITELIST = 'pwd, ls';

        // Both whitelisted
        const result1 = manager.assess('pwd && ls -la');
        assert.strictEqual(result1.level, 'SAFE', 'Whitelisted composite should be SAFE');

        // One whitelisted, one not
        const result2 = manager.assess('pwd && whoami');
        assert.strictEqual(result2.level, 'WARNING', 'Partially whitelisted composite should be WARNING');

        // One whitelisted, one dangerous
        const result3 = manager.assess('pwd && sudo reboot');
        assert.strictEqual(result3.level, 'DANGER', 'Composite with DANGER command should be DANGER');

        const result3b = manager.assess('pwd && rm -rf /');
        assert.strictEqual(result3b.level, 'BLOCKED', 'Composite with BLOCKED string should be BLOCKED');

        // Multiple separators
        const result4 = manager.assess('pwd ; ls -al | pwd || ls');
        assert.strictEqual(result4.level, 'SAFE', 'Multi-operator whitelisted composite should be SAFE');

        // Clean up
        process.env.COMMAND_WHITELIST = '';
    });

    console.log(`\n=======================`);
    console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

runTests();

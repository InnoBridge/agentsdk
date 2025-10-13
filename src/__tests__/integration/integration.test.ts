async function runTest() {
    console.log('Starting tests...');
};


(async function main() {
    try {
        // sync test

        // promise tests in order
        await runTest();
 

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
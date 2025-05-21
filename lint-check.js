// Simple script to check syntax
try {
    // This will parse the player.js file without executing it
    // If there's a syntax error, it will be caught
    const fs = require('fs');
    const content = fs.readFileSync('./js/player.js', 'utf8');
    
    // Try to evaluate just for syntax checking
    new Function(content);
    
    console.log('No syntax errors found in player.js');
} catch (error) {
    console.error('Syntax error detected:');
    console.error(error.message);
    
    // Try to get line number and context
    const match = error.message.match(/at line (\d+)/);
    if (match && match[1]) {
        const lineNumber = parseInt(match[1]);
        console.error(`Error around line ${lineNumber}`);
        
        // Try to show context
        try {
            const fs = require('fs');
            const content = fs.readFileSync('./js/player.js', 'utf8');
            const lines = content.split('\n');
            
            // Show 5 lines before and after
            const start = Math.max(0, lineNumber - 5);
            const end = Math.min(lines.length, lineNumber + 5);
            
            console.log('\nContext:');
            for (let i = start; i < end; i++) {
                console.log(`${i+1}: ${lines[i]}`);
            }
        } catch (e) {
            console.error('Could not show context:', e.message);
        }
    }
}

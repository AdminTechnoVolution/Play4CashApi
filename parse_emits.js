const fs = require('fs');
const glob = require('glob');

const games = ['chess', 'domino', 'halma', 'naval-battle'];
for (const game of games) {
    const files = glob.sync(`/Users/darricordoba/Documents/GitHub/Play4CashApi/src/websockets/${game}/actions/*.js`);
    for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.split('\n');
        for (let i=0; i<lines.length; i++) {
            if (lines[i].includes('WsBaseResponse.success') || lines[i].includes('WsBaseResponse.error')) {
                console.log(`[${game}] ${f.split('/').pop()}:${i+1} => ${lines[i].trim()}`);
                for (let j=i+1; j<i+15; j++) {
                    if (lines[j]) console.log(`  ${lines[j].trim()}`);
                    if (lines[j] && (lines[j].includes('})))') || lines[j].includes(')]') || lines[j].includes(');'))) break;
                }
            }
        }
    }
}

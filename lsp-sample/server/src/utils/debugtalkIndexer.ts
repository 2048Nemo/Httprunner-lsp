import { Location } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';

export class DebugTalkIndexer {
    // 使用 Map 作为内存索引（缓存）
    // key: functionName (string)
    // value: Location
    private functionIndex = new Map<string, Location>();
    private debugtalkUri: string | null = null;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        // 初始时尝试建立索引
        this.rebuildIndex();
    }

    /**
     * 重新解析 debugtalk.py 文件并建立或更新索引
     */
    public rebuildIndex(): void {
        const filePath = path.join(this.workspaceRoot, 'debugtalk.py');
        this.debugtalkUri = URI.file(filePath).toString();

        this.functionIndex.clear(); // 清空旧索引

        if (!fs.existsSync(filePath)) {
            console.log('debugtalk.py not found. Index is empty.');
            return;
        }

        console.log('Rebuilding index for debugtalk.py...');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split(/\r?\n/);

        // 正则表达式，用于匹配 'def function_name('
        const functionRegex = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = functionRegex.exec(line);

            if (match) {
                const functionName = match[1];
                const charIndex = line.indexOf(functionName);
                
                const location: Location = {
                    uri: this.debugtalkUri,
                    range: {
                        start: { line: i, character: charIndex },
                        end: { line: i, character: charIndex + functionName.length }
                    }
                };
                
                this.functionIndex.set(functionName, location);
                console.log(`Indexed function: "${functionName}" at line ${i + 1}`);
            }
        }
    }

    /**
     * 从索引中获取函数的定义位置
     * @param functionName 要查找的函数名
     * @returns {Location | null}
     */
    public getDefinition(functionName: string): Location | null {
        return this.functionIndex.get(functionName) || null;
    }
}
import { Location } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';

// 定义索引中存储的数据结构
export interface FunctionInfo {
    location: Location;
    signature: string; // 函数签名，例如 "def sleep(n_secs):"
    comments: string;  // 提取出的注释
}

export class DebugTalkIndexer {
    // Map 的值现在是 FunctionInfo 对象
    private functionIndex = new Map<string, FunctionInfo>();
    private debugtalkUri: string | null = null;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.rebuildIndex();
    }

    public rebuildIndex(): void {
        const filePath = path.join(this.workspaceRoot, 'debugtalk.py');
        this.debugtalkUri = URI.file(filePath).toString();
        this.functionIndex.clear();

        if (!fs.existsSync(filePath)) {
            console.log('debugtalk.py not found. Index is empty.');
            return;
        }

        console.log('Rebuilding index for debugtalk.py with comments...');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split(/\r?\n/);
        const functionRegex = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = functionRegex.exec(line);

            if (match) {
                const functionName = match[1];
                const charIndex = line.indexOf(functionName);
                
                // 1. 提取函数签名
                const signature = line.trim();

                // 2. 向上回溯，提取注释
                const commentLines: string[] = [];
                let commentLineIndex = i - 1;
                while (commentLineIndex >= 0) {
                    const prevLine = lines[commentLineIndex].trim();
                    if (prevLine.startsWith('#')) {
                        // 从后往前添加，所以用 unshift
                        commentLines.unshift(prevLine.replace(/^#\s*/, '')); 
                    } else if (prevLine === '') {
                        // 遇到空行，继续向上找
                    } else {
                        // 遇到非注释、非空行，停止查找
                        break;
                    }
                    commentLineIndex--;
                }
                const comments = commentLines.join('\n');

                const info: FunctionInfo = {
                    location: {
                        uri: this.debugtalkUri,
                        range: {
                            start: { line: i, character: charIndex },
                            end: { line: i, character: charIndex + functionName.length }
                        }
                    },
                    signature: signature,
                    comments: comments
                };
                
                this.functionIndex.set(functionName, info);
                console.log(`Indexed function: "${functionName}" with comments.`);
            }
        }
    }

    // 修改 getDefinition 为 getDefinitionInfo 以反映其返回更丰富的信息
    public getDefinitionInfo(functionName: string): FunctionInfo | null {
        return this.functionIndex.get(functionName) || null;
    }
}

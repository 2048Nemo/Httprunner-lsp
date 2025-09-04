// src/handlers/onHover.ts

import { Hover, HoverParams, MarkupKind } from 'vscode-languageserver';
import { IServerContext } from '../component/serverContext';
// 假设 analyzePosition 已经移到了一个公共的工具文件中
import { analyzePosition } from '../util/analyzer'; 

export function hoverRouter(context: IServerContext) {
	// 注册悬停处理器
	registerHoverHandler(context);
}
	

function registerHoverHandler(context: IServerContext) {
    const { connection, documents, indexer } = context;

    connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const lineText = document.getText({
            start: { line: params.position.line, character: 0 },
            end: { line: params.position.line + 1, character: 0 }
        });
        
        // 1. 分析光标下的符号
        const analysis = analyzePosition(lineText, params.position);
        
        // 我们只关心函数
        if (!analysis || analysis.type !== 'function') {
            return null;
        }

        // 2. 从索引器中获取函数的详细信息
        const funcInfo = indexer.getDefinitionInfo(analysis.name);
        if (!funcInfo) {
            return null;
        }

        // 3. 构建 Markdown 格式的悬浮提示内容
        const markdownContent = [];
        if (funcInfo.comments) {
            markdownContent.push(funcInfo.comments);
        }
        // 使用 python 代码块高亮函数签名
        markdownContent.push('```python\n' + funcInfo.signature + '\n```');
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: markdownContent.join('\n---\n') // 用分割线隔开注释和签名
            }
        };
    });
}
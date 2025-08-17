import { Position } from 'vscode-languageserver';

export function analyzePosition(lineText: string, position: Position): { type: string, name: string } | null {
    // 一个匹配变量的简单正则表达式
    const VarRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
    // 一个匹配 debugtalk 函数的简单正则表达式
    const FuncRegex = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\}/g;

    const vars=VarRegex.exec(lineText); // 触发正则表达式的执行
    const funcs = FuncRegex.exec(lineText); // 触发正则表达式的执行

    if(vars?.[0]&&position.character >= vars.index && position.character <= vars.index + vars[0].length) {
        return {
            type: 'variable',
            name: vars[1] // 返回变量名
        };
    }else if(funcs?.[0]&&position.character >= funcs.index && position.character <= funcs.index + funcs[0].length) {
        return {
            type: 'function',
            name: funcs[1] // 返回函数名
        };
    }
    // 如果没有匹配到变量或函数
    return null;

}
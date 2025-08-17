import { Connection, DefinitionParams, Location, Position } from 'vscode-languageserver';
import { TextDocuments } from 'vscode-languageserver/node';
import {parseDocument,  visit,Document,Pair,isScalar} from 'yaml';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DebugTalkIndexer } from '../component/debugtalkIndexer';
import { IServerContext } from '../component/serverContext';
import { YamlDocumentManager } from '../component/yamlDocumentManager';

export function definitionRouter(
  iServerContext: IServerContext
) {
  iServerContext.connection.onDefinition(async (params: DefinitionParams): Promise<Location | null> => {
    const document = iServerContext.documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    const position = params.position;
    const definitionPO: definitionPO = {
      connection: iServerContext.connection,
      documents: iServerContext.documents,
      position: position,
      document: document,
      debugtalkIndexer: iServerContext.indexer,
      yamlDocManager: iServerContext.yamlDocManager
    };
    switch (document.languageId) {
      case 'yaml':
      case 'yml':
        definitionPO.connection.console.log('Processing YAML definition request');
        definitionPO.connection.console.log(`Handling YAML definition: ${document.uri} at position: ${params.position.line}:${params.position.character}`);
        return handleVariableDefinition(definitionPO);
      case 'python':
		    definitionPO.connection.console.log('Processing Python definition request');
		    definitionPO.connection.console.log(`Handling Python definition: ${document.uri} at position: ${params.position.line}:${params.position.character}`);
		    return handlePythonDefinition(definitionPO);
	    case 'env':
		    definitionPO.connection.console.log('Processing .env definition request');
		    definitionPO.connection.console.log(`Handling .env definition: ${document.uri} at position: ${params.position.line}:${params.position.character}`);
		    return handleEnvDefinition(definitionPO);
		  default:
        return null;
    }
  });
}

// 专用于处理 onDefinition 跳转的接口传参对象
interface definitionPO{
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  position: Position;
  document: TextDocument;
  debugtalkIndexer: DebugTalkIndexer;
  yamlDocManager: YamlDocumentManager;
}

// YAML variable definition handler - simplified implementation
function handleVariableDefinition(
definitionPO: definitionPO
): Location | null {
  try {
    definitionPO.connection.console.log('Attempting to find variable definition');
    //查找文件跳转
    const path =handlePathFileDefinition(definitionPO);
    if(path){
      definitionPO.connection.console.log('Found path file definition: ' + path.uri);
      return path;
    }
    //查找变量定义
    const variable =findYamlVaribleDefinition(definitionPO);
	  if(variable){
      definitionPO.connection.console.log('Found variable definition: ' + variable.uri);
      return variable;
    }
    const debugtalk =findDebugtalkDefinition(definitionPO);
    if (debugtalk) {
      definitionPO.connection.console.log('Found debugtalk definition: ' + debugtalk.uri);
      return debugtalk;
    }
    return null;
  } catch (error) {
    if (error instanceof Error) {
      definitionPO.connection.console.error('Variable definition search failed: ' + error.message);
    } else {
      definitionPO.connection.console.error('Variable definition search failed: ' + String(error));
    }
    return null;
  }
}

// 示例：处理路径文件之间跳转
function handlePathFileDefinition(definitionPO:definitionPO): Location | null{
	const targetValue = findYamlTargetByPosition(definitionPO.position,definitionPO.document);
	if (!targetValue) {
		return null;
	}
	const docUri = URI.parse(definitionPO.document.uri);
	const workspaceFolder = path.dirname(docUri.fsPath);
	const targetPath = path.resolve(workspaceFolder, targetValue);

	if (!fs.existsSync(targetPath)) {
		return null;
	}

	return {
		uri: URI.file(targetPath).toString(),
		range: {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 10 }
		}
	};
}



// 根据位置查找YAML中对应的目标字段值
function findYamlTargetByPosition(
  position: Position,
  document: TextDocument
): string | null {
  const lineStart = { line: position.line, character: 0 };
  const lineEnd = { line: position.line + 1, character: 0 };
  const lineText = document.getText({ start: lineStart, end: lineEnd });
  const regex = /(url|testcase|api)\s*:\s*([^\s#]+\.ya?ml)/;
  const match = regex.exec(lineText);
  if (match) {
    const value = match[2];
    const valueStart = lineText.indexOf(value);
    const valueEnd = valueStart + value.length;
    if (position.character >= valueStart && position.character <= valueEnd) {
      return value;
    }
  }
  return null;
}


/**
 * 在给定位置识别出被 '$' 或 '${...}' 引用的变量名。
 * 这个函数现在可以处理两种语法。
 * * @param lineText 当前行的文本
 * @param position 当前光标位置
 * @returns { name: string } | null 变量名
 */
function getVariableAtPosition(lineText: string, position: Position): { name: string } | null {
    // 匹配两种模式: $varName or ${...$varName...}
    // 使用全局匹配来遍历行内所有可能的情况
    const regex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;

    while ((match = regex.exec(lineText)) !== null) {
        const varName = match[1];
        // match.index 是 $ 符号的位置
        const varStartIndex = match.index; 
        const varEndIndex = match.index + varName.length + 1;

        // 检查光标位置是否在当前匹配到的 `$variable` 范围内
        if (position.character >= varStartIndex && position.character <= varEndIndex) {
            return { name: varName };
        }
    }
    return null;
}

/**
 * 在YAML文档中查找特定父键下的变量定义。
 * (这个函数是我们之前完善的版本，现在是最终形态)
 * * @param doc - 已解析的 yaml Document 对象。
 * @param keyName - 要查找的变量名（key）。
 * @param parentKeyNames - 变量定义可能位于的父键名列表。
 * @returns {[number, number] | null} - 返回包含绝对偏移量的元组。参考 Yaml 库的 NodeBase 定义的结果队列，resultRange 是一个包含node起始和value结束偏移量的数组。
 * （这里的偏移量是绝对的number，可以通过 document.getpositionAt实现 Position 对象的转换）
 */
function findVariableDefinitionRange(doc: Document, keyName: string, parentKeyNames: string[]): [number, number] | null {
	let resultRange: [number, number] | null = null;
  visit(doc, {
    Scalar(key, node, path) {
      if (node.value === keyName && key === 'key') {
        //这里需要按照路径一次迭代寻找，如果是 yamlSeq /yamlmap 这种场景就需要跳过节点向前寻找，总之需要考虑一下其他 Node 子类的这种容器节点情况（YamlSeq/map/）
        for( let i = path.length - 1; i >= 0; i--) {
          // 获取当前节点元素的父元素,必须是pair 类型
          const parentPair = path[i];

          if(parentPair && parentPair instanceof Pair && isScalar(parentPair.key)) {
              if (parentKeyNames.includes(parentPair.key.value as string)) {
                  resultRange = node.range ? [node.range[0], node.range[1]] : null;
                  return visit.BREAK;
              }
          }
        }
      }
    }
  });

  return resultRange;
}


/**
 * 统一的查找变量定义位置的入口函数
 * (这个函数替换了你之前的所有三个函数)
 * * @param position 光标位置
 * @param document 当前文档
 * @returns {Location | null} 定义的位置
 */
export function findYamlVaribleDefinition(definitionPO:definitionPO): Location | null {
    // 1. 获取当前行的文本
    const lineText = definitionPO.document.getText({
        start: { line: definitionPO.position.line, character: 0 },
        end: { line: definitionPO.position.line + 1, character: 0 }
    });
    
    // 2. 在光标位置识别出变量名 (无论语法是 $var 还是 ${...$var...})
    const variableInfo = getVariableAtPosition(lineText, definitionPO.position);
    
    if (!variableInfo) {
        return null;
    }

    // 3. 解析整个 YAML 文档
    const fullText = definitionPO.document.getText();
    // 添加 try-catch 避免无效YAML导致服务崩溃
    let doc: Document;
    try {
        doc = parseDocument(fullText);
    } catch (e) {
        console.error("YAML parsing error:", e);
        return null;
    }

    if (!doc.contents) {
        return null;
    }
    
    // 4. 定义变量可能存在的容器键
    const containerKeys = ['variables', 'extract', 'parameters'];
    
    // 5. 在整个文档中寻找定义
    const definitionRange = findVariableDefinitionRange(doc, variableInfo.name, containerKeys);
    
    // 6. 如果找到，将偏移量转换为 Location 对象并返回
    if (definitionRange) {
        return {
            uri: definitionPO.document.uri,
            range: {
                start: definitionPO.document.positionAt(definitionRange[0]),
                end: definitionPO.document.positionAt(definitionRange[1])
            }
        };
    }

    return null;
}
// Python文件定义跳转处理
function handlePythonDefinition(
_definitionPO: definitionPO
): Location | null {
  return null;
}

// .env文件定义跳转处理
function handleEnvDefinition(
_definitionPO: definitionPO
): Location | null {
  return null;
}

/**
 * 查找插值语法 ${...} 中的函数调用，并返回其在 debugtalk.py 中的定义位置（占位）。
 * @param position 光标位置
 * @param document 当前文档
 * @returns {Location | null} 在 debugtalk.py 中的位置
 */
export function findDebugtalkDefinition(definitionPO:definitionPO): Location | null {
  // 1. 获取当前行的文本
  const lineText = definitionPO.document.getText({
    start: { line: definitionPO.position.line, character: 0 },
    end: { line: definitionPO.position.line + 1, character: 0 }
  });

  // 2. 使用新的正则表达式，并添加 'g' 标志以遍历行内所有匹配项
  const regex = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\}/g;
  let match;

  // 3. 循环遍历当前行所有的函数调用，以确定光标在哪一个上面
  while ((match = regex.exec(lineText)) !== null) {
    // match[0] 是整个匹配到的字符串, e.g., "${sleep($second)}"
    // match[1] 是我们捕获的函数名, e.g., "sleep"
    
    const functionName = match[1];
    const expressionStart = match.index; // "${" 的起始位置
    const expressionEnd = expressionStart + match[0].length; // "}" 的结束位置

    // 4. 检查光标是否在当前匹配的 ${...} 表达式的范围内
    if (definitionPO.position.character >= expressionStart && definitionPO.position.character <= expressionEnd) {
      console.log(`光标位于函数 "${functionName}" 的调用上。`);

      // 5. 构造指向 debugtalk.py 文件的 URI 和一个起始位置
      // 注意：这里只是一个示例，它将总是跳转到 debugtalk.py 的文件开头。
      // 在一个更完整的实现中，您可能需要解析 debugtalk.py 文件来找到函数的确切行号。
      // const workspaceFolder = path.dirname(URI.parse(document.uri).fsPath);
      // const targetUri = URI.file(path.join(workspaceFolder, 'debugtalk.py')).toString();

      const result = definitionPO.debugtalkIndexer.getDefinitionInfo(functionName);
      console.log(`查找函数 "${functionName}" 的定义位置: `, result);
      return result ? result.location : null;
    }
  }

  // 如果光标不在任何一个函数调用上，则返回 null
  return null;
}
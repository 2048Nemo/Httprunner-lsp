import { Connection, DefinitionParams, Location, Position } from 'vscode-languageserver';
import { TextDocuments } from 'vscode-languageserver/node';
import {parseDocument,  visit,Document,Pair,isScalar} from 'yaml';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function definitionRouter(
  connection: Connection,
  documents: TextDocuments<TextDocument>
) {
  connection.onDefinition(async (params: DefinitionParams): Promise<Location | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    switch (document.languageId) {
      case 'yaml':
      case 'yml':
        connection.console.log('Processing YAML definition request');
        connection.console.log(`Handling YAML definition: ${document.uri} at position: ${params.position.line}:${params.position.character}`);
        return handleVariableDefinition(document, params.position, connection);
      case 'python':
		connection.console.log('Processing Python definition request');
		connection.console.log(`Handling Python definition: ${document.uri} at position: ${params.position.line}:${params.position.character}`);
		return handlePythonDefinition(document, params.position);
	  case 'env':
		connection.console.log('Processing .env definition request');
		connection.console.log(`Handling .env definition: ${document.uri} at position: ${params.position.line}:${params.position.character}`);
		return handleEnvDefinition(document, params.position);
		default:
        return null;
    }
  });
}

// YAML variable definition handler - simplified implementation
function handleVariableDefinition(
  document: TextDocument,
  position: Position,
  connection: Connection
): Location | null {
  try {
    connection.console.log('Attempting to find variable definition');
    //查找文件跳转
    const path =handlePathFileDefinition(position, document);
    if(path){
      connection.console.log('Found path file definition: ' + path.uri);
      return path;
    }
    //查找变量定义
    const variable =findYamlDefinition(position, document);
	  if(variable){
      connection.console.log('Found variable definition: ' + variable.uri);
      return variable;
    }
    return null;
  } catch (error) {
    if (error instanceof Error) {
      connection.console.error('Variable definition search failed: ' + error.message);
    } else {
      connection.console.error('Variable definition search failed: ' + String(error));
    }
    return null;
  }
}

// 示例：处理路径文件之间跳转
function handlePathFileDefinition( position: Position, document: TextDocument): Location | null{
	const targetValue = findYamlTargetByPosition(position, document);
	if (!targetValue) {
		return null;
	}
	const docUri = URI.parse(document.uri);
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
  let num = 0;
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
                  num++;
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
export function findYamlDefinition(position: Position, document: TextDocument): Location | null {
    // 1. 获取当前行的文本
    const lineText = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
    });
    
    // 2. 在光标位置识别出变量名 (无论语法是 $var 还是 ${...$var...})
    const variableInfo = getVariableAtPosition(lineText, position);
    
    if (!variableInfo) {
        return null;
    }

    // 3. 解析整个 YAML 文档
    const fullText = document.getText();
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
            uri: document.uri,
            range: {
                start: document.positionAt(definitionRange[0]),
                end: document.positionAt(definitionRange[1])
            }
        };
    }

    return null;
}
// Python文件定义跳转处理
function handlePythonDefinition(
  _document: TextDocument,
  _position: Position
): Location | null {
  return null;
}

// .env文件定义跳转处理
function handleEnvDefinition(
  _document: TextDocument,
  _position: Position
): Location | null {
  return null;
}
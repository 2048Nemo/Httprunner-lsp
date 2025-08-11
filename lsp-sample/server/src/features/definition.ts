import { Connection, DefinitionParams, Location, Position } from 'vscode-languageserver';
import { TextDocuments } from 'vscode-languageserver/node';
import {parseDocument, Node } from 'yaml';
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
        connection.console.log('接收到yaml跳转请求');
        connection.console.log(`处理YAML定义跳转: ${document.uri} 位置: ${params.position.line}:${params.position.character}`);
        return handleYamlDefinition(document, params.position, connection);
      case 'python':
        return handlePythonDefinition(document, params.position);
      case 'env':
        return handleEnvDefinition(document, params.position);
      default:
        // 示例：返回 api.yaml 的跳转
        { 
		  	const location = "/Users/nemolexist/WebstormProjects/testfile/api.yaml";
          	connection.window.showInformationMessage(`server goto definition: ${params.textDocument.uri} + ${location}`);
          	return {
          	  uri: URI.file(location).toString(),
          	  range: {
          	    start: { line: 0, character: 0 },
          	    end: { line: 0, character: 10 }
          	  }
          	}; 
		  }
    }
  });
}

// YAML文件定义跳转处理
function handleYamlDefinition(
  document: TextDocument,
  position: Position,
  connection: Connection
): Location | null {
  try {
    const text = document.getText();
    const yamlDoc = parseDocument(text);
    if (!yamlDoc.contents) {
      connection.window.showInformationMessage('YAML文档内容为空');
      return null;
    }

    return handlePathFileDefinition(yamlDoc.contents, position, document);
  } catch (error) {
    if (error instanceof Error) {
      connection.console.error('YAML解析失败: ' + error.message);
    } else {
      connection.console.error('YAML解析失败: ' + String(error));
    }
    return null;
  }
}
// 示例：处理路径文件之间跳转
function handlePathFileDefinition(yamlDocNode: Node | null, position: Position, document: TextDocument): Location | null{
	const targetValue = findYamlTargetByPosition(yamlDocNode, position, document);
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
  _node: Node | null,
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
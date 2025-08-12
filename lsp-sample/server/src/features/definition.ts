import { Connection, DefinitionParams, Location, Position } from 'vscode-languageserver';
import { TextDocuments } from 'vscode-languageserver/node';
import {parseDocument,  visit} from 'yaml';
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
	  // 尝试路径文件跳转
	  const pathDefinition = handlePathFileDefinition(position, document);
	  if (pathDefinition) {
		  return pathDefinition;
	  }
	  // 尝试变量引用跳转
	  const varibleDefinition = handleVaribleDefinition(position, document);
	  if (varibleDefinition) {
		  return varibleDefinition;
	  }
	  // 尝试插值函数（debugtalk）跳转
	  const interpolationDefinition = handleInterpolationDefinition(position, document);
	  if (interpolationDefinition) {
		  return interpolationDefinition;
	  }
	  return null;
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


function handleVaribleDefinition(position: Position, document: TextDocument): Location | null {
	const targetValuePosition = findInnerYamlTargetByVarible(position, document);
	let outerTargetValue:Location | null = null;
	let result: Location | null = targetValuePosition;

	if ( result === null){
		outerTargetValue = findOuterYamlTargetByVarible(position, document);
		if (outerTargetValue === null) {
			return null;
		}
		result = outerTargetValue;
	}

	return {
		uri: result.uri.toString(),
		range: {
			start: { line: result.range.start.line, character: result.range.start.character },
			end: { line: result.range.end.line, character: result.range.end.character }
		}
	};
}


//处理插值函数处理
function handleInterpolationDefinition(position: Position, document: TextDocument): Location | null{
	const targetValuePosition = findInnerYamlTargetByInterpolation(position, document);
	let outerTargetValue:Location | null = null;
	let result: Location | null = targetValuePosition;

	if ( result === null){
		outerTargetValue = findOuterYamlTargetByInterpolation(position, document);
		if (outerTargetValue === null) {
			return null;
		}
		result = outerTargetValue;
	}

	return {
		uri: result.uri.toString(),
		range: {
			start: { line: result.range.start.line, character: result.range.start.character },
			end: { line: result.range.end.line, character: result.range.end.character }
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



//查找内置变量定义位置
function findInnerYamlTargetByVarible(position: Position,document: TextDocument): Location | null {
  	const lineStart = { line: position.line, character: 0 };
  	const lineEnd = { line: position.line + 1, character: 0 };
  	const lineText = document.getText({ start: lineStart, end: lineEnd });
  	const regex = /\${([^}]+)}/;

	const match = regex.exec(lineText);
	  if (match) {
		  const value = match[1];
		  const valueStart = lineText.indexOf(value);
		  const valueEnd = valueStart + value.length;
		  if (position.character >= valueStart && position.character <= valueEnd) {
			  //根据 value 查找全文中变量定义位置，遍历 node 节点，查找所有 extract: 以及variables: parameters: 以下的子节点定义为 变量定义
			  const varDefinition = parseDocument(document.getText());
			  	visit(varDefinition, {
					  Pair(_, pair, node) {
						  if (pair.key && pair.key === '3') {return visit.REMOVE;}
					  },
					  Scalar(key, node, parent) {
						  // 获取parent节点的key值判断
						  if (parent && 'key' in parent && parent.key) {
							  const parentKey = parent.key.toString();
						  }
						  if (
							  parent &&
							  node.type === 'PLAIN'
						  ) {
							  node.type = 'QUOTE_SINGLE';
						  }
					  }
			  	});
			  return {
				  uri: document.uri.toString(),
				  range: {
					  start: { line: position.line, character: position.character },
					  end: { line: position.line, character: position.character }
				  }
			  };
		  }
	  }
	  return null;
 }

 // 查找外部变量定义位置
 function findOuterYamlTargetByVarible(position: Position ,document: TextDocument): Location | null {
  	if (position) {
  		const lineStart = { line: position.line, character: 0 };
  		const lineEnd = { line: position.line + 1, character: 0 };
  		const lineText = document.getText({ start: lineStart, end: lineEnd });
  		const regex = /\${()}/;
  		const match = regex.exec(lineText);
		  if (match) {
			  const value = match[1];
			  const valueStart = lineText.indexOf(value);
			  const valueEnd = valueStart + value.length;
			  if (position.character >= valueStart && position.character <= valueEnd) {
				  //根据 value 获取变量定义位置，遍历 node 节点，查找所有 extract: 以及variables: parameters: 以下的子节点定义为 变量定义
				  const varDefinition = parseDocument(document.getText());
				  visit(varDefinition, {});
			  }
		  }
  	}
	  return {
		  uri: document.uri.toString(),
		  range: {
			  start: { line: position.line, character: position.character },
			  end: { line: position.line, character: position.character }
		  }
	  };
 }


// 插值语法查找函数
function findInnerYamlTargetByInterpolation(position: Position,document: TextDocument): Location | null {
  	const lineStart = { line: position.line, character: 0 };
  	const lineEnd = { line: position.line + 1, character: 0 };
  	const lineText = document.getText({ start: lineStart, end: lineEnd });
  	const regex = /\${([^}]+)}/;

	const match = regex.exec(lineText);
	  if (match) {
		  const value = match[1];
		  const valueStart = lineText.indexOf(value);
		  const valueEnd = valueStart + value.length;
		  if (position.character >= valueStart && position.character <= valueEnd) {
			  //根据 value 查找全文中变量定义位置，遍历 node 节点，查找所有 extract: 以及variables: parameters: 以下的子节点定义为 变量定义
			  const varDefinition = parseDocument(document.getText());
			  	visit(varDefinition, {
					  Pair(_, pair, node) {
						  if (pair.key && pair.key === '3') {return visit.REMOVE;}
					  },
					  Scalar(key, node, parent) {
						  // 获取parent节点的key值判断
						  if (parent && 'key' in parent && parent.key) {
							  const parentKey = parent.key.toString();
						  }
						  if (
							  parent &&
							  node.type === 'PLAIN'
						  ) {
							  node.type = 'QUOTE_SINGLE';
						  }
					  }
			  	});
			  return {
				  uri: document.uri.toString(),
				  range: {
					  start: { line: position.line, character: position.character },
					  end: { line: position.line, character: position.character }
				  }
			  };
		  }
	  }
	  return null;
 }

 function findOuterYamlTargetByInterpolation(position: Position ,document: TextDocument): Location | null {
  	if (position) {
  		const lineStart = { line: position.line, character: 0 };
  		const lineEnd = { line: position.line + 1, character: 0 };
  		const lineText = document.getText({ start: lineStart, end: lineEnd });
  		const regex = /\${()}/;
  		const match = regex.exec(lineText);
		  if (match) {
			  const value = match[1];
			  const valueStart = lineText.indexOf(value);
			  const valueEnd = valueStart + value.length;
			  if (position.character >= valueStart && position.character <= valueEnd) {
				  //根据 value 获取变量定义位置，遍历 node 节点，查找所有 extract: 以及variables: parameters: 以下的子节点定义为 变量定义
				  const varDefinition = parseDocument(document.getText());
				  visit(varDefinition, {});
			  }
		  }
  	}
	  return {
		  uri: document.uri.toString(),
		  range: {
			  start: { line: position.line, character: position.character },
			  end: { line: position.line, character: position.character }
		  }
	  };
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
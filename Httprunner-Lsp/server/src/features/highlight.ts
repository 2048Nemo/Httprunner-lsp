import { Connection, TextDocuments, DocumentHighlight, DocumentHighlightKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
export function documentHighlightRouter(
  connection: Connection,
  documents: TextDocuments<TextDocument>
) {
  connection.onDocumentHighlight((params): DocumentHighlight[] => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
	  return [];
	}

	const highlights: DocumentHighlight[] = [];
	const text = document.getText();
	const offset = document.offsetAt(params.position);

	// 匹配类似 "api: api/esignManage/OrgUser/org/getOrganizationByOrganizationCode.yml" 的完整路径
	const apiPathPattern = /api:\s*[^\s]+\.yml/g;
	let match: RegExpExecArray | null;

	while ((match = apiPathPattern.exec(text)) !== null) {
	  const startOffset = match.index;
	  const endOffset = startOffset + match[0].length;

	  // 检查光标是否在匹配的路径范围内
	  if (offset >= startOffset && offset <= endOffset) {
		// 高亮整个路径
		highlights.push({
		  range: {
			start: document.positionAt(startOffset),
			end: document.positionAt(endOffset)
		  },
		  kind: DocumentHighlightKind.Text
		});
		// 找到匹配项后退出循环
		break;
	  }
	}

	// 添加调试日志
	if (highlights.length > 0) {
	  connection.console.log(`Document highlight found at position ${offset}`);
	}

	return highlights;
  });
}
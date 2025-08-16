import { TextDocument } from 'vscode-languageserver-textdocument';
// import { Connection, DefinitionParams, Location, Position } from 'vscode-languageserver';
export class YamlDocumentManager {

	private documents = new Map<string, TextDocument>();

	constructor() {
		// 初始化时可以加载已有的 YAML 文档
	}

	public addDocument(document: TextDocument): void {
		this.documents.set(document.uri, document);
	}

	public getDocument(uri: string): TextDocument | undefined {
		return this.documents.get(uri);
	}

	public update(document: TextDocument): void {
		this.documents.set(document.uri, document);
	}
	public remove(uri: string): void {
		this.documents.delete(uri);
	}

	public getAllDocuments(): TextDocument[] {
		return Array.from(this.documents.values());
	}
}
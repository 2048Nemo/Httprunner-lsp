import { Connection, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DebugTalkIndexer } from './debugtalkIndexer';
import { YamlDocumentManager } from './yamlDocumentManager';

// 定义一个接口，描述我们的“服务容器”有哪些内容
export interface IServerContext {
    connection: Connection;
    documents: TextDocuments<TextDocument>;
    indexer: DebugTalkIndexer;
    yamlDocManager: YamlDocumentManager;
}
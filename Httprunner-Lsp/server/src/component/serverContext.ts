import { Connection, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DebugTalkIndexer } from './debugtalkIndexer';
import { YamlDocumentManager } from './yamlDocumentManager';
import { LspConfig } from '../util/lspConfig';

// 定义一个接口，描述我们的“服务容器”有哪些内容
export interface IServerContext {
    connection: Connection;
    documents: TextDocuments<TextDocument>;
    indexer: DebugTalkIndexer;
    yamlDocManager: YamlDocumentManager;
    lspConfig: LspConfig; // 可选的 LSP 配置
}


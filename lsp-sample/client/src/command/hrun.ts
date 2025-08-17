// src/hrunCommands.ts

import * as vscode from 'vscode';
import { LspConfig } from '../core/lspConfig'; // 引入 LspConfig 类

export function activateHrunCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('my-hrun-extension.runHrunScript', (uri: vscode.Uri) => {
            let fileUri: vscode.Uri;

            if (uri && uri.fsPath) {
                fileUri = uri;
            } else if (vscode.window.activeTextEditor) {
                fileUri = vscode.window.activeTextEditor.document.uri;
            } else {
                vscode.window.showErrorMessage('无法确定要运行的文件。');
                return;
            }

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('文件不属于任何工作区。');
                return;
            }
            const rootPath = workspaceFolder.uri.fsPath;
            const filePath = fileUri.fsPath;

            // --- 【关键修改】 ---
            // 1. 实例化 LspConfig，它会自动从根目录读取 lsp-config.yaml
            let config: LspConfig;
            try {
                config = new LspConfig(rootPath);
            } catch (e) {
                if (e instanceof Error) {
                    vscode.window.showErrorMessage(`加载配置失败: ${e.message}`);
                }
                return;
            }

            // 2. 从 config 实例中获取配置，而不是从 vscode.workspace.getConfiguration
            const condaEnvName = config.condaEnv;
            const testsPath = config.testsPath; // 获取配置的 tests 路径

            const terminalOptions: vscode.TerminalOptions = {
                name: "hrun tests",
                // 3. 使用从配置文件中读取的 testsPath 作为 cwd
                cwd: testsPath,
                env: {
                    // 环境变量可以保持不变，或同样从配置文件中读取
                    "API_KEY": "your-secret-api-key-from-config-or-elsewhere",
                }
            };

            const terminal = vscode.window.createTerminal(terminalOptions);

            let command;
            //判断是否有 conda，没有则不执行
            if (condaEnvName) {
                command = `conda run -n ${condaEnvName} hrun "${filePath}"`;
            } else {
                command = `hrun "${filePath}"`;
            }
            
            terminal.show();
            terminal.sendText(command);
        })
    );
}

export function deactivate() { }
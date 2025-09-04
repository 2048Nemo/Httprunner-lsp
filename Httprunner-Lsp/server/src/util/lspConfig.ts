import * as fs from 'fs';
import * as path from 'path';
import { parseDocument } from 'yaml';

// 定义一个接口，用于描述配置文件的结构，方便进行类型检查
interface IConfigFile {
	debugtalkPath?: string;
	condaEnv?: string;
	testsPath?: string;
}

export class LspConfig {
	public readonly workspaceRoot: string;
	public readonly debugtalkPath: string;
	public readonly condaEnv: string;
	public readonly testsPath: string;

	constructor(workspaceRoot: string) {
		if (!workspaceRoot) {
			throw new Error('工作区根目录不能为空 (Workspace root cannot be empty)');
		}
		this.workspaceRoot = workspaceRoot;

		// 1. 设置默认值
		let debugtalkPath = 'debugtalk.py';
		let condaEnv = 'base'; // 默认 conda 环境
		let testsPath = 'tests'; // 默认 tests 文件夹路径

		// 2. 尝试读取和解析配置文件
		const configFilePath = path.join(this.workspaceRoot, 'lsp-config.yaml');

		if (fs.existsSync(configFilePath)) {
			console.log(`Found config file: ${configFilePath}`);
			try {
				const configContent = fs.readFileSync(configFilePath, 'utf-8');
				// 使用 .toJSON() 将YAML内容直接转换为普通的JavaScript对象
				const configData = parseDocument(configContent).toJSON() as IConfigFile;

				// 3. 校验并覆盖默认值
				if (configData) {
					if (typeof configData.debugtalkPath === 'string') {
						if (fs.existsSync(path.join(this.workspaceRoot, configData.debugtalkPath))) {
							debugtalkPath = configData.debugtalkPath.trim();
							console.log(`  - Loaded 'debugtalkPath': ${debugtalkPath}`);
						} else {
							console.log(`  - Load 'debugtalkPath' failed: ${debugtalkPath}`);
						}
					}
					if (typeof configData.condaEnv === 'string') {
						condaEnv = configData.condaEnv.trim();
						console.log(`  - Loaded 'condaEnv': ${condaEnv}`);
					}
					if (typeof configData.testsPath === 'string') {
						if (fs.existsSync(path.join(this.workspaceRoot, configData.testsPath))) {
							testsPath = configData.testsPath;
							console.log(`  - Loaded 'testsPath': ${testsPath}`);
						} else {
							console.log(`  - Load 'testsPath' failed: ${testsPath}`);
						}
					}
				}
			} catch (error) {
				if (error instanceof Error) {

					console.error(`Error reading or parsing lsp-config.yaml: ${error.message}`);
					// 如果配置文件存在但解析失败，可以选择抛出错误或继续使用默认值
					// 这里我们选择继续使用默认值，并打印错误日志
				}
			}
		} else {
			console.log('lsp-config.yaml not found. Using default values.');
		}

		// 4. 根据最终确定的值，设置类的只读属性
		this.condaEnv = condaEnv;
		// 将相对路径转换为绝对路径和URI
		this.testsPath = path.join(this.workspaceRoot, testsPath);
		this.debugtalkPath = path.join(this.workspaceRoot, debugtalkPath);
	}
}
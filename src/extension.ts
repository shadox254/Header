import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {

    // Register the manual command to insert the header
    let disposable = vscode.commands.registerCommand('42header.insertHeader', () => {
        const editor = vscode.window.activeTextEditor;
        updateHeader(editor);
    });

    context.subscriptions.push(disposable);

    // Listen for file save events to automatically update the header
    vscode.workspace.onWillSaveTextDocument(event => {
        const document = event.document;
        const editor = vscode.window.activeTextEditor;

        // Only update if the saved document is the one currently active
        if (editor && editor.document === document) {
            updateHeader(editor, event);
        }
    });
}

/**
 * Main function to handle header insertion or update
 */
function updateHeader(editor: vscode.TextEditor | undefined, event?: vscode.TextDocumentWillSaveEvent) {
    if (!editor) return;

    const document = editor.document;
    
    // Safety check: verify if the language is supported to avoid breaking binary files or unknown formats
    const delimiters = getDelimiters(document.languageId);
    if (!delimiters) return; 

    // Retrieve user configuration from VS Code settings
    const config = vscode.workspace.getConfiguration('42header');
    const configUser = config.get<string>('username');
    const configEmail = config.get<string>('email');

    // Logic: Config > System Environment > Default ('marvin')
    // process.env.USERNAME is often used on Windows, USER on Unix
    const systemUser = process.env.USER || process.env.USERNAME || 'marvin';
    const user = configUser && configUser.trim() !== "" ? configUser : systemUser;
    
    // Logic: Config > Constructed Email
    const mail = configEmail && configEmail.trim() !== "" ? configEmail : `${user}@student.42.fr`;

    const fileName = path.basename(document.fileName);
    const now = new Date();
    const nowDateStr = formatDate(now);

    const currentHeaderRange = getHeaderRange(document);
    
    let createdDate = nowDateStr;
    let createdBy = user;

    // Smart retrieval: If a header exists, preserve the original creation info
    if (currentHeaderRange) {
        const oldHeaderText = document.getText(currentHeaderRange);
        const createdMatch = oldHeaderText.match(/Created: (.*) by (.*)/);
        
        if (createdMatch) {
            createdDate = createdMatch[1].trim();
            createdBy = createdMatch[2].trim();
        }
    }

    // Generate the new header content
    const header = generateHeader(fileName, user, mail, nowDateStr, createdDate, createdBy, delimiters);

    if (event && currentHeaderRange) {
        // Save mode: Use waitUntil to ensure the edit is applied before the file hits the disk
        event.waitUntil(Promise.resolve([
            new vscode.TextEdit(currentHeaderRange, header)
        ]));
    } else {
        // Manual mode: Insert or replace immediately
        editor.edit(editBuilder => {
            if (currentHeaderRange) {
                editBuilder.replace(currentHeaderRange, header);
            } else {
                editBuilder.insert(new vscode.Position(0, 0), header);
            }
        });
    }
}

/**
 * Native date formatting (YYYY/MM/DD HH:mm:ss)
 * Removes the need for external libraries like moment.js
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Generates the ASCII header with dynamic content
 */
function generateHeader(fileName: string, user: string, mail: string, updatedDate: string, createdDate: string, createdBy: string, delims: { start: string, end: string }): string {
    const width = 79; // Fixed width for 42 standard
    
    // Helper to pad the content correctly with the delimiters
    const fillLine = (content: string) => {
        const left = delims.start + " "; 
        const right = " " + delims.end;
        const spaceAvailable = width - left.length - right.length;
        
        // Truncate if too long to prevent breaking the alignment
        const safeContent = content.length > spaceAvailable ? content.substring(0, spaceAvailable) : content;
        
        return left + safeContent.padEnd(spaceAvailable, ' ') + right + "\n";
    };

    // Create the top and bottom borders
    const borderContentLength = width - delims.start.length - delims.end.length;
    const border = delims.start + "*".repeat(borderContentLength) + delims.end + "\n";

    let res = border;
    
    // Custom ASCII Art Area
    res += fillLine("                               :::       ::::::::");
    res += fillLine("                             :+:       :+:    :+:");
    res += fillLine("                           +:+ +:+           +:+");
    res += fillLine("                          +#+  +:+         +#+");
    res += fillLine("                         +#+#+#+#+#+     +#+");
    res += fillLine("                             #+#      ##########");

    res += border;
    // File Info Area
    res += fillLine(`File: ${fileName}`);
    res += fillLine(`By: ${user} <${mail}>`);
    res += fillLine(`Created: ${createdDate} by ${createdBy}`);
    res += fillLine(`Updated: ${updatedDate} by ${user}`);
    res += border;

    return res;
}

/**
 * Returns the correct comment delimiters for the given language ID
 * Returns null if the language is not supported to avoid errors
 */
function getDelimiters(languageId: string): { start: string, end: string } | null {
    switch (languageId) {
        case 'c':
        case 'cpp':
        case 'java':
        case 'javascript':
        case 'typescript':
        case 'php':
        case 'css':
        case 'scss':
        case 'go':
        case 'rust':
        case 'swift':
        case 'kotlin':
            return { start: '/*', end: '*/' };
        case 'html':
        case 'xml':
        case 'markdown':
            return { start: '', end: ''};
        case 'makefile':
        case 'python':
        case 'shellscript':
        case 'yaml':
        case 'dockerfile':
        case 'ruby':
        case 'perl':
        case 'r':
            return { start: '#', end: '#' };
        case 'lua':
        case 'sql':
        case 'haskell':
            return { start: '--', end: '--' };
        default:
            return { start: '/*', end: '*/' };
    }
}

/**
 * Detects if a header already exists in the file
 * Looks for the "Updated:" keyword and the specific border structure
 */
function getHeaderRange(document: vscode.TextDocument): vscode.Range | null {
    const maxLines = Math.min(document.lineCount, 20);
    let headerEndLine = -1;
    let hasUpdated = false;

    for (let i = 0; i < maxLines; i++) {
        const line = document.lineAt(i).text;
        if (line.includes("Updated:")) {
            hasUpdated = true;
            // The header ends one line after "Updated" (the bottom border)
            headerEndLine = i + 1; 
        }
    }

    if (hasUpdated && headerEndLine > 0) {
        return new vscode.Range(0, 0, headerEndLine + 1, 0);
    }

    return null;
}
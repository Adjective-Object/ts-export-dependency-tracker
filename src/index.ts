import {
    SourceFile,
    isImportDeclaration,
    ImportDeclaration,
    isExportDeclaration,
    isStringLiteral,
    ImportSpecifier,
    isImportSpecifier,
    ExportDeclaration,
    isExportSpecifier,
} from 'typescript';
import { importDeclaration } from '@babel/types';
import { fileURLToPath } from 'url';

type ExportIdentifier = string;
type ModuleSymbolIdentifier = string;
type ImportIdentifier = string;

type ExportImportMap = Map<ExportIdentifier, ImportIdentifier>;

interface PartialImportSymbolMap {
    newImports: Set<ImportIdentifier>;
    newTrackedSymbols: Map<ModuleSymbolIdentifier, Set<ImportIdentifier>>;
}

function getBindingsFromImportDeclaration(
    importDeclarationNode: ImportDeclaration,
): PartialImportSymbolMap {
    const newImports: Set<ImportIdentifier> = new Set();
    const newTrackedSymbols: Map<
        ModuleSymbolIdentifier,
        Set<ImportIdentifier>
    > = new Map();

    if (!isStringLiteral(importDeclarationNode.moduleSpecifier)) {
        throw new Error(
            "import declaration's module specifier was not a string literal: " +
                importDeclarationNode.getFullText(),
        );
    }
    const moduleSpecifier = importDeclarationNode.moduleSpecifier.text;
    newImports.add(moduleSpecifier);

    if (importDeclarationNode.importClause?.name) {
        // this is a default import
        newTrackedSymbols.set(
            importDeclarationNode.importClause.name.text,
            new Set([moduleSpecifier]),
        );
    } else if (importDeclarationNode.importClause?.namedBindings) {
        importDeclarationNode.importClause.namedBindings.forEachChild(
            specifier => {
                if (!isImportSpecifier(specifier)) {
                    throw new Error(
                        'import clause had a child which was not an import specifier',
                    );
                }

                newTrackedSymbols.set(
                    specifier.name.text,
                    new Set([moduleSpecifier]),
                );
            },
        );
    } else {
        throw new Error(
            'import declaration had neither name nor namedBindings: ' +
                importDeclarationNode.getFullText(),
        );
    }

    return { newImports, newTrackedSymbols };
}

export function getBindingsFromExportDeclaration(
    exportDeclarationNode: ExportDeclaration,
): PartialImportSymbolMap {
    const newImports: Set<ImportIdentifier> = new Set();
    const newTrackedSymbols: Map<
        ModuleSymbolIdentifier,
        Set<ImportIdentifier>
    > = new Map();
    const directExports: Map<ExportIdentifier, ImportIdentifier> = new Map();
    const moduleExports: Map<
        ExportIdentifier,
        Set<ModuleSymbolIdentifier>
    > = new Map();

    // track imports and exports
    let moduleSpecifier: string | null = null;
    if (exportDeclarationNode.moduleSpecifier) {
        if (!isStringLiteral(exportDeclarationNode.moduleSpecifier)) {
            throw new Error(
                "export declaration's module specifier was not a string literal: " +
                    exportDeclarationNode.getFullText(),
            );
        }

        moduleSpecifier = exportDeclarationNode.moduleSpecifier.text;
        newImports.add(moduleSpecifier);
    }

    if (exportDeclarationNode.name) {
        // single export statement
        if (moduleSpecifier) {
            directExports.set(exportDeclarationNode.name.text, moduleSpecifier);
        } else {
            // if the export is a name and there is no module specifier, this is illegal.
            throw new Error(
                'export declaration had no module specifier but had a name. this is illegal: ' +
                    exportDeclarationNode.getFullText(),
            );
        }
    } else if (exportDeclarationNode?.exportClause) {
        exportDeclarationNode.exportClause.elements.forEach(specifier => {
            if (!isExportSpecifier(specifier)) {
                throw new Error(
                    'import clause had a child which was not an import specifier',
                );
            }

            newTrackedSymbols.set(
                specifier.name.text,
                new Set([moduleSpecifier]),
            );
        });
    }

    return {
        newImports,
        newTrackedSymbols,
    };
}

function getExportMap(file: SourceFile): ExportImportMap {
    let imports: Set<ImportIdentifier> = new Set();
    let trackedSymbols: Map<
        ModuleSymbolIdentifier,
        Set<ImportIdentifier>
    > = new Map();

    file.forEachChild(node => {
        if (isImportDeclaration(node)) {
            const {
                newImports,
                newTrackedSymbols,
            } = getBindingsFromImportDeclaration(node);
            imports = new Set([...imports, ...newImports]);
            trackedSymbols = new Map([
                ...trackedSymbols.entries(),
                ...newTrackedSymbols.entries(),
            ]);
        } else if (isExportDeclaration(node)) {
            const {
                newImports,
                newTrackedSymbols,
            } = getBindingsFromExportDeclaration(node);
            imports = new Set([...imports, ...newImports]);
            trackedSymbols = new Map([
                ...trackedSymbols.entries(),
                ...newTrackedSymbols.entries(),
            ]);
        }
    });
}

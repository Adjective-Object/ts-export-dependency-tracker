import {
    SourceFile,
    isImportDeclaration,
    ImportDeclaration,
    isExportDeclaration,
    isStringLiteral,
    isImportSpecifier,
    ExportDeclaration,
    isExportSpecifier,
    isExportAssignment,
    ExportAssignment,
    isIdentifier,
    Node,
    isFunctionDeclaration,
    SyntaxKind,
    FunctionDeclaration,
    isVariableStatement,
    VariableStatement,
    VariableDeclarationList,
    VariableDeclaration,
    isArrayBindingPattern,
    isArrayLiteralExpression,
    isObjectBindingPattern,
    isNamespaceImport,
    isNamedImports,
    isOmittedExpression,
    isSpreadElement,
    isCallExpression,
} from 'typescript';
import { walkNode, getNamesFromParameterDeclName } from './scope/walkScopes';
import { LexicalScopeStack } from './scope/LexicalScopeStack';

type ExportIdentifier = string;
type ModuleSymbolIdentifier = string;
type ImportModuleIdentifier = string;

type ExportImportMap = Map<ExportIdentifier, Set<ImportModuleIdentifier>>;

interface PartialImportSymbolMap {
    moduleSymbolsToOtherModuleSymbols: Map<
        ModuleSymbolIdentifier,
        Set<ModuleSymbolIdentifier>
    >;
    moduleSymbolsToImports: Map<
        ModuleSymbolIdentifier,
        Set<ImportModuleIdentifier>
    >;
    moduleExportsToModuleSymbols: Map<
        ExportIdentifier,
        Set<ModuleSymbolIdentifier>
    >;
    moduleExportsToDirectImports: Map<
        ExportIdentifier,
        Set<ImportModuleIdentifier>
    >;
}

const getEmptySymbolMap = (): PartialImportSymbolMap => ({
    moduleSymbolsToOtherModuleSymbols: new Map(),
    moduleSymbolsToImports: new Map(),
    moduleExportsToModuleSymbols: new Map(),
    moduleExportsToDirectImports: new Map(),
});

const mergeMapOfSets = <T, V>(
    mapOfSets1: Map<T, Set<V>>,
    mapOfSets2: Map<T, Set<V>>,
) => {
    const finalMap = new Map([...mapOfSets1.entries()]);

    for (let [k, vset] of mapOfSets2.entries()) {
        const buildingVSet = finalMap.get(k);
        if (buildingVSet) {
            for (let v of vset) {
                buildingVSet.add(v);
            }
        } else {
            finalMap.set(k, new Set(vset));
        }
    }

    return finalMap;
};

const mergeSymbolMap = (
    m1: PartialImportSymbolMap,
    m2: PartialImportSymbolMap,
): PartialImportSymbolMap => ({
    moduleSymbolsToOtherModuleSymbols: mergeMapOfSets(
        m1.moduleSymbolsToOtherModuleSymbols,
        m2.moduleSymbolsToOtherModuleSymbols,
    ),
    moduleSymbolsToImports: mergeMapOfSets(
        m1.moduleSymbolsToImports,
        m2.moduleSymbolsToImports,
    ),
    moduleExportsToModuleSymbols: mergeMapOfSets(
        m1.moduleExportsToModuleSymbols,
        m2.moduleExportsToModuleSymbols,
    ),
    moduleExportsToDirectImports: new Map([
        ...m1.moduleExportsToDirectImports.entries(),
        ...m2.moduleExportsToDirectImports.entries(),
    ]),
});

function getBindingsFromImportDeclaration(
    importDeclarationNode: ImportDeclaration,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();

    if (!isStringLiteral(importDeclarationNode.moduleSpecifier)) {
        throw new Error(
            `import declaration's module specifier was not a string literal: ${JSON.stringify(
                importDeclarationNode,
                null,
                2,
            )}`,
        );
    }
    const moduleSpecifier = importDeclarationNode.moduleSpecifier.text;

    if (importDeclarationNode.importClause?.name) {
        // this is a default import
        symbols.moduleSymbolsToImports.set(
            importDeclarationNode.importClause.name.text,
            new Set([moduleSpecifier]),
        );
    } else if (importDeclarationNode.importClause?.namedBindings) {
        const namedBindings = importDeclarationNode.importClause.namedBindings;
        if (isNamespaceImport(namedBindings)) {
            symbols.moduleSymbolsToImports.set(
                namedBindings.name.text,
                new Set([moduleSpecifier]),
            );
        } else if (isNamedImports(namedBindings)) {
            importDeclarationNode.importClause.namedBindings.forEachChild(
                specifier => {
                    if (isImportSpecifier(specifier)) {
                        symbols.moduleSymbolsToImports.set(
                            specifier.name.text,
                            new Set([moduleSpecifier]),
                        );
                    } else if (isNamespaceImport(specifier)) {
                        symbols.moduleSymbolsToImports.set(
                            specifier.name.text,
                            new Set([moduleSpecifier]),
                        );
                    } else {
                        throw new Error(
                            `import clause named imports had an unexpected child: ${JSON.stringify(
                                specifier,
                                null,
                                2,
                            )}`,
                        );
                    }
                },
            );
        }
    }
    return symbols;
}

export function getBindingsFromExportDeclaration(
    exportDeclarationNode: ExportDeclaration,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();

    // track imports and exports
    let moduleSpecifier: string | null = null;
    if (exportDeclarationNode.moduleSpecifier) {
        if (!isStringLiteral(exportDeclarationNode.moduleSpecifier)) {
            throw new Error(
                `export declaration's module specifier was not a string literal: ${JSON.stringify(
                    exportDeclarationNode,
                    null,
                    2,
                )}`,
            );
        }

        moduleSpecifier = exportDeclarationNode.moduleSpecifier.text;
    }

    if (exportDeclarationNode.name) {
        // single export statement
        if (moduleSpecifier) {
            symbols.moduleExportsToDirectImports.set(
                exportDeclarationNode.name.text,
                new Set([moduleSpecifier]),
            );
        } else {
            // if the export is a name and there is no module specifier, this is illegal.
            throw new Error(
                `export declaration had no module specifier but had a name. this is illegal: ${JSON.stringify(
                    exportDeclarationNode.getFullText(),
                    null,
                    2,
                )}`,
            );
        }
    } else if (exportDeclarationNode?.exportClause) {
        exportDeclarationNode.exportClause.elements.forEach(specifier => {
            if (!isExportSpecifier(specifier)) {
                throw new Error(
                    'import clause had a child which was not an import specifier',
                );
            }

            if (moduleSpecifier) {
                symbols.moduleExportsToDirectImports.set(
                    specifier.name.text,
                    new Set([moduleSpecifier]),
                );
            } else {
                // Renamed export depends on the export
                if (specifier.propertyName) {
                    const existingSet =
                        symbols.moduleExportsToModuleSymbols.get(
                            specifier.name.text,
                        ) || new Set();
                    existingSet.add(specifier.propertyName.text);
                    symbols.moduleExportsToModuleSymbols.set(
                        specifier.name.text,
                        existingSet,
                    );
                } else {
                    const existingSet =
                        symbols.moduleExportsToModuleSymbols.get(
                            specifier.name.text,
                        ) || new Set();
                    existingSet.add(specifier.name.text);

                    symbols.moduleExportsToModuleSymbols.set(
                        specifier.name.text,
                        existingSet,
                    );
                }
            }
        });
    }

    return symbols;
}

/**
 * Gets all identifiers reference inside a node that are not shadowed
 * within that same node.
 *
 * @param node
 */
export function getNonshadowedIdentifiersReferencedInNode(
    node: Node,
): Set<ModuleSymbolIdentifier> {
    if (isIdentifier(node)) {
        return new Set([node.text]);
    } else {
        const referencedModuleScopeIdentifiers = new Set<string>();

        walkNode(new LexicalScopeStack(), node, (currentNode, currentStack) => {
            if (isIdentifier(currentNode)) {
                const identifierName = currentNode.text;
                const isShadowedVariable = currentStack.current.hasIdentifier(
                    identifierName,
                );
                if (!isShadowedVariable) {
                    referencedModuleScopeIdentifiers.add(identifierName);
                }
            }
        });

        return referencedModuleScopeIdentifiers;
    }
}

/**
 * Finds all modules that are `require()`'d in a node, writing the output to `out`
 */
function getRequiresInNode(node: Node, out: Set<string>) {
    if (
        isCallExpression(node) &&
        isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length == 1
    ) {
        const moduleSpecifierString = node.arguments[0];
        if (isStringLiteral(moduleSpecifierString)) {
            out.add(moduleSpecifierString.text);
        }
    } else {
        node.forEachChild(child => getRequiresInNode(child, out));
    }
}

/**
 * Finds all modules that are `require()`'d in a node, writing the output to `out`
 */
function getRequiresInExpression(expression: Node) {
    const out = new Set<string>();
    getRequiresInNode(expression, out);
    return out;
}

export function getBindingsFromExportAssignment(
    exportAssignment: ExportAssignment,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();

    symbols.moduleExportsToModuleSymbols.set(
        'default',
        getNonshadowedIdentifiersReferencedInNode(exportAssignment.expression),
    );

    symbols.moduleExportsToDirectImports.set(
        'default',
        getRequiresInExpression(exportAssignment.expression),
    );

    return symbols;
}

function getBindingsFromFunctionDeclaration(
    fnDeclaration: FunctionDeclaration,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();
    const referencedSymbols = getNonshadowedIdentifiersReferencedInNode(
        fnDeclaration,
    );

    const isExported = fnDeclaration.modifiers?.some(
        modifier => modifier.kind === SyntaxKind.ExportKeyword,
    );
    const isDefault = fnDeclaration.modifiers?.some(
        modifier => modifier.kind === SyntaxKind.DefaultKeyword,
    );

    const requiredPaths = getRequiresInExpression(fnDeclaration);

    if (isExported) {
        if (isDefault) {
            symbols.moduleExportsToModuleSymbols.set(
                'default',
                referencedSymbols,
            );
            symbols.moduleExportsToDirectImports.set('default', requiredPaths);
        } else if (fnDeclaration.name) {
            symbols.moduleExportsToModuleSymbols.set(
                fnDeclaration.name.text,
                referencedSymbols,
            );
            symbols.moduleExportsToDirectImports.set(
                fnDeclaration.name.text,
                requiredPaths,
            );
        } else {
            throw new Error(
                `encountered exported function declaration with no 'default' modifier nor function name: ${JSON.stringify(
                    fnDeclaration,
                    null,
                    2,
                )}`,
            );
        }
    }

    if (fnDeclaration.name) {
        symbols.moduleSymbolsToOtherModuleSymbols.set(
            fnDeclaration.name.text,
            referencedSymbols,
        );
        symbols.moduleSymbolsToImports.set(
            fnDeclaration.name.text,
            requiredPaths,
        );
    }

    return symbols;
}

/**
 * get mapping of something to something else
 */
function getDeclaredSymbolDependencies(
    node: VariableDeclarationList,
): [
    Map<ModuleSymbolIdentifier, Set<ModuleSymbolIdentifier>>,
    Map<ModuleSymbolIdentifier, Set<ImportModuleIdentifier>>,
] {
    const declaredSymbols: Map<
        ModuleSymbolIdentifier,
        Set<ModuleSymbolIdentifier>
    > = new Map();

    const declaredImports: Map<
        ModuleSymbolIdentifier,
        Set<ImportModuleIdentifier>
    > = new Map();

    node.declarations.forEach((declaration: VariableDeclaration) => {
        if (isIdentifier(declaration.name)) {
            // If there are variables with no initialing expression but are still being declared,
            // skip over them
            const boundName = declaration.name.text;
            if (declaredSymbols.has(boundName)) {
                throw new Error(
                    `duplicate symbol ${boundName} bound in variable declaration list`,
                );
            }
            declaredSymbols.set(
                boundName,
                new Set(
                    declaration.initializer
                        ? getNonshadowedIdentifiersReferencedInNode(
                              declaration.initializer,
                          )
                        : new Set(),
                ),
            );
            declaredImports.set(
                boundName,
                declaration.initializer
                    ? getRequiresInExpression(declaration.initializer)
                    : new Set(),
            );
        } else if (isArrayBindingPattern(declaration.name)) {
            const bindingElements = declaration.name.elements;
            const initializer = declaration.initializer;
            if (!initializer) {
                // abandon tracking when there is no initializer
                return;
            } else if (
                !isArrayLiteralExpression(initializer) ||
                initializer.elements.some(elem => isSpreadElement(elem))
            ) {
                // Bind all names in the array binding pattern to be dependent on
                // all values in the initializer
                for (let i = 0; i < bindingElements.length; i++) {
                    const bindingElement = bindingElements[i];
                    if (isOmittedExpression(bindingElement)) {
                        continue;
                    }
                    const boundNames = getNamesFromParameterDeclName(
                        bindingElement.name,
                    );
                    const dependencies = getNonshadowedIdentifiersReferencedInNode(
                        initializer,
                    );
                    boundNames.forEach(boundName => {
                        declaredSymbols.set(boundName, dependencies);
                        declaredImports.set(
                            boundName,
                            getRequiresInExpression(initializer),
                        );
                    });
                }
                return;
            }

            // bind the specific names in the array if the initializer is an array
            for (let i = 0; i < bindingElements.length; i++) {
                const initializingElement = initializer.elements[i];
                const bindingElement = bindingElements[i];
                if (isOmittedExpression(bindingElement)) {
                    continue;
                }
                // If there are elements with no initialing expression but are still being declared,
                // skip over them
                const boundNames = getNamesFromParameterDeclName(
                    bindingElement.name,
                );
                const dependencies = getNonshadowedIdentifiersReferencedInNode(
                    initializingElement,
                );
                boundNames.forEach(boundName => {
                    declaredSymbols.set(boundName, dependencies);
                    declaredImports.set(
                        boundName,
                        getRequiresInExpression(initializer),
                    );
                });
            }
        } else if (isObjectBindingPattern(declaration.name)) {
            const bindingElements = declaration.name.elements;
            const initializer = declaration.initializer;
            if (!initializer) {
                // abandon tracking when there is no initializer
                return;
            }

            for (let i = 0; i < bindingElements.length; i++) {
                const bindingElement = bindingElements[i];
                if (isOmittedExpression(bindingElement)) {
                    continue;
                }
                const boundNames = getNamesFromParameterDeclName(
                    bindingElement.name,
                );
                const dependencies = getNonshadowedIdentifiersReferencedInNode(
                    initializer,
                );
                boundNames.forEach(boundName => {
                    declaredSymbols.set(boundName, dependencies);
                    declaredImports.set(
                        boundName,
                        getRequiresInExpression(initializer),
                    );
                });
            }
            // TODO handle binding specific names in objects
            return;
        } else {
            throw new Error(`Unknown declaration of kind ${declaration.kind}`);
        }
    });

    return [declaredSymbols, declaredImports];
}

function getBindingsFromVariableStatement(
    variableStatement: VariableStatement,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();

    const isExported = variableStatement.modifiers?.some(
        modifier => modifier.kind === SyntaxKind.ExportKeyword,
    );
    const targetMapForModuleSymbols = isExported
        ? symbols.moduleExportsToModuleSymbols
        : symbols.moduleSymbolsToOtherModuleSymbols;
    const targetMapForFoundRequires = isExported
        ? symbols.moduleExportsToDirectImports
        : symbols.moduleSymbolsToImports;

    const [
        declaredSymbolDependencies,
        declaredRequires,
    ] = getDeclaredSymbolDependencies(variableStatement.declarationList);

    for (let [
        identifier,
        dependencies,
    ] of declaredSymbolDependencies.entries()) {
        if (targetMapForModuleSymbols.has(identifier)) {
            throw new Error(
                `duplicate identifiers in target map: ${identifier}`,
            );
        }

        targetMapForModuleSymbols.set(identifier, dependencies);
    }

    for (let [identifier, requires] of declaredRequires.entries()) {
        if (targetMapForFoundRequires.has(identifier)) {
            throw new Error(
                `duplicate identifiers in target map: ${identifier}`,
            );
        }

        targetMapForFoundRequires.set(identifier, requires);
    }

    return symbols;
}

function reverseMap<TKey, TSetMember>(
    m: Map<TKey, Set<TSetMember>>,
): Map<TSetMember, Set<TKey>> {
    const reversedMap = new Map();
    for (let [key, members] of m.entries()) {
        for (let member of members) {
            if (!reversedMap.has(member)) {
                reversedMap.set(member, new Set());
            }
            reversedMap.get(member)!.add(key);
        }
    }
    return reversedMap;
}

function getAllDirectAndIndirectDependencies<T>(
    depmap: Map<T, Set<T>>,
    entrypoint: T,
): Set<T> {
    const visited = new Set<T>();
    const frontier = [entrypoint];
    while (frontier.length) {
        const current = frontier.pop()!;
        visited.add(current);
        const currentDeps = depmap.get(current);
        if (currentDeps) {
            for (let dep of currentDeps) {
                if (!visited.has(dep)) {
                    frontier.push(dep);
                }
            }
        }
    }

    return visited;
}

function getExportMapFromSymbolMap(
    symbols: PartialImportSymbolMap,
): ExportImportMap {
    const exportToImportedModuleMapping: ExportImportMap = new Map();
    for (let [
        exportName,
        importName,
    ] of symbols.moduleExportsToDirectImports.entries()) {
        exportToImportedModuleMapping.set(exportName, new Set(importName));
    }

    // build reverse symbol maps
    const importDeps = reverseMap(symbols.moduleSymbolsToImports);
    const moduleSymbolDeps = reverseMap(
        symbols.moduleSymbolsToOtherModuleSymbols,
    );
    const moduleSymbolsToExports = reverseMap(
        symbols.moduleExportsToModuleSymbols,
    );

    for (let importName of importDeps.keys()) {
        for (let moduleSymbolName of importDeps.get(importName)!) {
            const theseModuleSymbolDependenices = getAllDirectAndIndirectDependencies(
                moduleSymbolDeps,
                moduleSymbolName,
            );

            for (let dep of theseModuleSymbolDependenices) {
                if (moduleSymbolsToExports.has(dep)) {
                    for (let exportName of moduleSymbolsToExports.get(dep)!) {
                        if (!exportToImportedModuleMapping.has(exportName)) {
                            exportToImportedModuleMapping.set(
                                exportName,
                                new Set<string>(),
                            );
                        }
                        exportToImportedModuleMapping
                            .get(exportName)!
                            .add(importName);
                    }
                }
            }
        }
    }

    return exportToImportedModuleMapping;
}

export function getSymbolMap(file: SourceFile): PartialImportSymbolMap {
    let symbols = getEmptySymbolMap();

    file.forEachChild(node => {
        if (isImportDeclaration(node)) {
            const newSymbols = getBindingsFromImportDeclaration(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        } else if (isExportDeclaration(node)) {
            const newSymbols = getBindingsFromExportDeclaration(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        } else if (isExportAssignment(node)) {
            const newSymbols = getBindingsFromExportAssignment(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        } else if (isFunctionDeclaration(node)) {
            const newSymbols = getBindingsFromFunctionDeclaration(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        } else if (isVariableStatement(node)) {
            const newSymbols = getBindingsFromVariableStatement(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        }
    });

    return symbols;
}

export function getExportMap(file: SourceFile): ExportImportMap {
    const symbols = getSymbolMap(file);

    return getExportMapFromSymbolMap(symbols);
}

export default getExportMap;

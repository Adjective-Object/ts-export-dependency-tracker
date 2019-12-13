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
    isObjectLiteralExpression,
    isObjectBindingPattern,
    isPropertyAssignment,
    isNamespaceImport,
    isNamedImports,
} from 'typescript';

type ExportIdentifier = string;
type ModuleSymbolIdentifier = string;
type ImportModuleIdentifier = string;

type ExportImportMap = Map<ExportIdentifier, Set<ImportModuleIdentifier>>;

interface PartialImportSymbolMap {
    importModuleIdentifiers: Set<ImportModuleIdentifier>;
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
    moduleExportsToDirectImports: Map<ExportIdentifier, ImportModuleIdentifier>;
}

const getEmptySymbolMap = (): PartialImportSymbolMap => ({
    importModuleIdentifiers: new Set(),
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
    importModuleIdentifiers: new Set([
        ...m1.importModuleIdentifiers,
        ...m2.importModuleIdentifiers,
    ]),
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
    symbols.importModuleIdentifiers.add(moduleSpecifier);

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
        symbols.importModuleIdentifiers.add(moduleSpecifier);
    }

    if (exportDeclarationNode.name) {
        // single export statement
        if (moduleSpecifier) {
            symbols.moduleExportsToDirectImports.set(
                exportDeclarationNode.name.text,
                moduleSpecifier,
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
                    moduleSpecifier,
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
 * Gets all identifiers reference inside a node.
 *
 * This should be redone to handle variable shadowing, etc.
 * @param node
 */
export function getSymbolsReferencedInNode(
    node: Node,
): Set<ModuleSymbolIdentifier> {
    if (isIdentifier(node)) {
        return new Set([node.text]);
    } else {
        const mergedChildren = new Set<ModuleSymbolIdentifier>();
        node.forEachChild(childNode => {
            getSymbolsReferencedInNode(childNode).forEach(symbol =>
                mergedChildren.add(symbol),
            );
        });

        return mergedChildren;
    }
}

export function getBindingsFromExportAssignment(
    exportAssignment: ExportAssignment,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();

    symbols.moduleExportsToModuleSymbols.set(
        'default',
        getSymbolsReferencedInNode(exportAssignment.expression),
    );

    return symbols;
}

function getBindingsFromFunctionDeclaration(
    fnDeclaration: FunctionDeclaration,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();
    const referencedSymbols = getSymbolsReferencedInNode(fnDeclaration);

    const isExported = fnDeclaration.modifiers?.some(
        modifier => modifier.kind === SyntaxKind.ExportKeyword,
    );
    const isDefault = fnDeclaration.modifiers?.some(
        modifier => modifier.kind === SyntaxKind.DefaultKeyword,
    );

    if (isExported) {
        if (isDefault) {
            symbols.moduleExportsToModuleSymbols.set(
                'default',
                referencedSymbols,
            );
        } else if (fnDeclaration.name) {
            symbols.moduleExportsToModuleSymbols.set(
                fnDeclaration.name.text,
                referencedSymbols,
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
    }

    return symbols;
}

/**
 * get mapping of something to something else
 */
function getDeclaredSymbolDependencies(
    node: VariableDeclarationList,
): Map<ModuleSymbolIdentifier, Set<ModuleSymbolIdentifier>> {
    const declaredSymbols: Map<
        ModuleSymbolIdentifier,
        Set<ModuleSymbolIdentifier>
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
                        ? getSymbolsReferencedInNode(declaration.initializer)
                        : new Set(),
                ),
            );
        } else if (isArrayBindingPattern(declaration.name)) {
            const bindingElements = declaration.name.elements;
            const initializer = declaration.initializer;
            if (!initializer || !isArrayLiteralExpression(initializer)) {
                return;
            }
            for (let i = 0; i < bindingElements.length; i++) {
                const initializingElement = initializer.elements[i];
                // If there are elements with no initialing expression but are still being declared,
                // skip over them
                const boundName = bindingElements[i].getText();
                if (declaredSymbols.has(boundName)) {
                    throw new Error(
                        `duplicate symbol ${boundName} bound in variable declaration list`,
                    );
                }
                declaredSymbols.set(
                    boundName,
                    new Set(
                        initializingElement
                            ? getSymbolsReferencedInNode(initializingElement)
                            : new Set(),
                    ),
                );
            }
        } else if (isObjectBindingPattern(declaration.name)) {
            const bindingElements = declaration.name.elements;
            for (let bindingElement of bindingElements) {
                const initializer = declaration.initializer;
                if (!initializer || !isObjectLiteralExpression(initializer)) {
                    continue;
                }
                const matchingProps = initializer.properties.filter(
                    prop =>
                        prop.name &&
                        prop.name.getText() ===
                            (
                                bindingElement.propertyName ||
                                bindingElement.name
                            ).getText(),
                );
                if (matchingProps.length !== 1) {
                    continue;
                }
                const matchingProp = matchingProps[0];
                if (
                    // This should be a redundant cast because we're inside an object
                    isPropertyAssignment(matchingProp)
                ) {
                    const boundName = bindingElement.getText();
                    if (declaredSymbols.has(boundName)) {
                        throw new Error(
                            `duplicate symbol ${boundName} bound in variable declaration list`,
                        );
                    }
                    declaredSymbols.set(
                        boundName,
                        new Set(
                            matchingProp.initializer
                                ? getSymbolsReferencedInNode(
                                      matchingProp.initializer,
                                  )
                                : new Set(),
                        ),
                    );
                }
            }
        } else {
            throw new Error(`Unknown declaration of kind ${declaration.kind}`);
        }
    });

    return declaredSymbols;
}

function getBindingsFromVariableStatement(
    variableStatement: VariableStatement,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();

    const isExported = variableStatement.modifiers?.some(
        modifier => modifier.kind === SyntaxKind.ExportKeyword,
    );
    const targetMap = isExported
        ? symbols.moduleExportsToModuleSymbols
        : symbols.moduleSymbolsToOtherModuleSymbols;

    const declaedDependencies = getDeclaredSymbolDependencies(
        variableStatement.declarationList,
    );

    for (let [identifier, dependencies] of declaedDependencies.entries()) {
        if (targetMap.has(identifier)) {
            throw new Error(
                `duplicate identifiers in target map: ${identifier}`,
            );
        }

        targetMap.set(identifier, dependencies);
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
        exportToImportedModuleMapping.set(exportName, new Set([importName]));
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

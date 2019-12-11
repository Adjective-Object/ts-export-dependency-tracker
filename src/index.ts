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
} from 'typescript';

type ExportIdentifier = string;
type ModuleSymbolIdentifier = string;
type ImportModuleIdentifier = string;

type ExportImportMap = Map<ExportIdentifier, ImportModuleIdentifier>;

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
        m1.moduleSymbolsToImports,
        m2.moduleSymbolsToImports,
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
            "import declaration's module specifier was not a string literal: " +
                importDeclarationNode.getFullText(),
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
        importDeclarationNode.importClause.namedBindings.forEachChild(
            specifier => {
                if (!isImportSpecifier(specifier)) {
                    throw new Error(
                        'import clause had a child which was not an import specifier',
                    );
                }

                symbols.moduleSymbolsToImports.set(
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
                "export declaration's module specifier was not a string literal: " +
                    exportDeclarationNode.getFullText(),
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

export function getSymbolsReferencedInNode(
    node: Node,
): Set<ModuleSymbolIdentifier> {
    // TODO handle variable shadowing

    if (isIdentifier(node)) {
        return new Set([node.text]);
    } else if (node.getChildCount() !== 0) {
        const childNodesSymbols = node
            .getChildren()
            .map(child => getSymbolsReferencedInNode(child));
        const mergedChildren = new Set<ModuleSymbolIdentifier>();

        for (let childNodeSymbols of childNodesSymbols) {
            for (let childNodeSymbol of childNodeSymbols) {
                mergedChildren.add(childNodeSymbol);
            }
        }

        return mergedChildren;
    } else {
        return new Set();
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

function getBindingsFromExportedFunctionDeclaration(
    fnDeclaration: FunctionDeclaration,
): PartialImportSymbolMap {
    const symbols = getEmptySymbolMap();
    const referencedSymbols = getSymbolsReferencedInNode(fnDeclaration);

    if (
        fnDeclaration.modifiers?.some(
            modifier => modifier.kind === SyntaxKind.DefaultKeyword,
        )
    ) {
        // default export
        symbols.moduleExportsToModuleSymbols.set('default', referencedSymbols);
    } else if (fnDeclaration.name) {
        symbols.moduleExportsToModuleSymbols.set(
            fnDeclaration.name.text,
            referencedSymbols,
        );
    } else {
        throw new Error(
            'encountered exported function declaration with no `default` modifier nor function name: ' +
                fnDeclaration.getText(),
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
            const boundName = bindingElement.getText();
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

    // TODO getting the actual bindings and setting them in the map.
    // need to handle array and object destructuring assignment here as well..

    const declaedDependencies = getDeclaredSymbolDependencies(
        variableStatement.declarationList,
    );

    for (let [identifier, dependencies] of declaedDependencies.entries()) {
        if (targetMap.has(identifier)) {
            throw new Error(
                `duplicate identifiers in target map: ${idnetifier}`,
            );
        }

        targetMap.set(identifier, dependencies);
    }

    for (let declaration of variableStatement.declarationList.declarations) {
        const initializerSymbols = getSymbolsReferencedInNode(declaration);
    }

    return symbols;
}

function getExportMap(file: SourceFile): ExportImportMap {
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
        } else if (
            isFunctionDeclaration(node) &&
            node.modifiers?.some(
                modifier => modifier.kind === SyntaxKind.ExportKeyword,
            )
        ) {
            const newSymbols = getBindingsFromExportedFunctionDeclaration(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        } else if (isVariableStatement(node)) {
            const newSymbols = getBindingsFromVariableStatement(node);
            symbols = mergeSymbolMap(symbols, newSymbols);
        }
    });

    // TODO convert symbol map into direct import / export map
    
}

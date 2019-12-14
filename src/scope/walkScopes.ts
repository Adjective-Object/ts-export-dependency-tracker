import * as ts from 'typescript';
import { LexicalScope } from './LexicalScope';
import { LexicalScopeStack } from './LexicalScopeStack';

interface ScopeStartInfo {
    namesToBindInScope: string[];
    traversePoint: ts.Node;
}

export const getNamesFromParameterDeclName = (
    parameterDeclName:
        | ts.Identifier
        | ts.ObjectBindingPattern
        | ts.ArrayBindingPattern,
): string[] => {
    if (ts.isIdentifier(parameterDeclName)) {
        return [parameterDeclName.text];
    } else if (ts.isObjectBindingPattern(parameterDeclName)) {
        return parameterDeclName.elements
            .map((element: ts.BindingElement) =>
                getNamesFromParameterDeclName(element.name),
            )
            .reduce((a, b) => a.concat(b), []);
    } else if (ts.isArrayBindingPattern(parameterDeclName)) {
        return parameterDeclName.elements
            .map((element: ts.ArrayBindingElement) =>
                getNamesFromParameterDeclName(
                    (element as ts.BindingElement).name,
                ),
            )
            .reduce((a, b) => a.concat(b), []);
    } else {
        throw new Error('unexpected binding pattern in parameter list');
    }
};

/**
 * If this node binds a new scope, returns the names that should be bound at the beginning
 * of that scope, as well as the node to start traversal of the scope at.
 *
 * @param node the node to check
 */
function getScopeChild(node: ts.Node): ScopeStartInfo | undefined {
    if (ts.isFunctionDeclaration(node)) {
        if (!node.body) {
            return undefined;
        }
        return {
            namesToBindInScope: node.parameters
                .map(parameterDecl =>
                    getNamesFromParameterDeclName(parameterDecl.name),
                )
                .reduce((a, b) => a.concat(b), []),
            traversePoint: node.body,
        };
    } else if (ts.isFunctionExpression(node)) {
        if (!node.body) {
            return undefined;
        }
        return {
            namesToBindInScope: node.parameters
                .map(parameterDecl =>
                    getNamesFromParameterDeclName(parameterDecl.name),
                )
                .reduce((a, b) => a.concat(b), []),
            traversePoint: node.body,
        };
    } else if (ts.isBlock(node)) {
        return {
            namesToBindInScope: [],
            traversePoint: node,
        };
    } else if (
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node)
    ) {
        if (
            !node.initializer ||
            !ts.isVariableDeclarationList(node.initializer)
        ) {
            return {
                namesToBindInScope: [],
                traversePoint: node.statement,
            };
        }
        return {
            namesToBindInScope: getBoundNamesInVariableDeclarationList(
                node.initializer,
            ),
            traversePoint: node.statement,
        };
    } else if (ts.isCatchClause(node)) {
        if (node.variableDeclaration) {
            return {
                namesToBindInScope: getNamesFromParameterDeclName(
                    node.variableDeclaration.name,
                ),
                traversePoint: node.block,
            };
        } else {
            return {
                namesToBindInScope: [],
                traversePoint: node.block,
            };
        }
    }

    return undefined;
}

function getBoundNamesInVariableDeclarationList(
    node: ts.VariableDeclarationList,
) {
    const boundNames: string[] = [];

    node.declarations.forEach((declaration: ts.VariableDeclaration) => {
        if (ts.isArrayBindingPattern(declaration.name)) {
            const bindingElements = declaration.name.elements;
            const initializer = declaration.initializer;
            if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
                return;
            }
            for (let i = 0; i < bindingElements.length; i++) {
                const initializingElement = initializer.elements[i];
                // If there are elements with no initialing expression but are still being declared,
                // skip over them
                if (initializingElement == null) continue;
                boundNames.push(bindingElements[i].getText());
            }
        } else if (ts.isObjectBindingPattern(declaration.name)) {
            const bindingElements = declaration.name.elements;
            for (let bindingElement of bindingElements) {
                const initializer = declaration.initializer;
                if (
                    !initializer ||
                    !ts.isObjectLiteralExpression(initializer)
                ) {
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
                if (ts.isPropertyAssignment(matchingProp)) {
                    boundNames.push(bindingElement.name.getText());
                }
            }
        } else if (ts.isIdentifier(declaration.name)) {
            // If there are variables that are declared but not initialized, we still want to track them as bound names.
            boundNames.push(declaration.name.text);
        } else {
            throw new Error(`Unknown declaration of kind ${declaration.kind}`);
        }
    });

    return boundNames;
}

type NodeCb = (node: ts.Node, stackState: LexicalScopeStack) => void;
export function walkNode(
    stack: LexicalScopeStack,
    node: ts.Node,
    eachNodeCb: NodeCb,
) {
    eachNodeCb(node, stack);

    const scopeChild = getScopeChild(node);
    if (scopeChild) {
        stack.push(new LexicalScope());
        scopeChild.namesToBindInScope.forEach(scopedIdentifier =>
            stack.current.declareIdentifier(scopedIdentifier),
        );

        // Step down to the child to avoid infinite recursion on Blocks,
        // since the scope iteration point of a Block is the scope itself.
        scopeChild.traversePoint.forEachChild(child =>
            walkNode(stack, child, eachNodeCb),
        );

        stack.pop();
    } else if (ts.isVariableDeclarationList(node)) {
        const boundNames = getBoundNamesInVariableDeclarationList(node);
        boundNames.forEach(boundName =>
            stack.current.declareIdentifier(boundName),
        );
    } else if (ts.isPropertyAccessExpression(node)) {
        // only walk the expression part of propertyAccessExpressions, since
        // property access cannot reference anything in the parent scope.
        walkNode(stack, node.expression, eachNodeCb);
    } else {
        node.forEachChild(child => walkNode(stack, child, eachNodeCb));
    }
}
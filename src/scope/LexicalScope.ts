/**
 * Represents a lexical scope, This can be:
 * - the body of a function,
 * - the body of a loop
 * - the body of a conditional
 * - empty scopes (e.g. in a switch case)
 * - try/catch blcoks
 *
 * This tracks some meta against those identifiers
 */
export class LexicalScope {
    parentScope: LexicalScope | null = null;
    children: LexicalScope[] = [];
    identifiers: Set<string> = new Set();

    declareIdentifier(identifier: string): void {
        this.identifiers.add(identifier);
    }

    hasIdentifier(identifier: string): boolean {
        return this.identifiers.has(identifier);
    }

    private _hasIdentifierInParentScopes(identifier: string): boolean {
        return this.parentScope
            ? this.parentScope.hasIdentifier(identifier) ||
                  this.parentScope._hasIdentifierInParentScopes(identifier)
            : false;
    }
}

import { LexicalScope } from './LexicalScope';

export class LexicalScopeStack {
    current: LexicalScope = new LexicalScope();

    push(scope: LexicalScope) {
        if (this.current !== null) {
            this.current.children.push(scope);
            scope.parentScope = this.current;
        }

        this.current = scope;
    }
    pop() {
        if (this.current.parentScope) {
            this.current = this.current.parentScope;
        } else {
            throw new Error('LexicalScopeStack : could not pop root scope');
        }
    }
}

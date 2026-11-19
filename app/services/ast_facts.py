import ast

def literal(node):
    try:
        return ast.literal_eval(node)
    except Exception:
        return ast.unparse(node) if hasattr(ast, "unparse") else "<dynamic>"

def analyze_file(source, relative_path):
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return {"functions": [], "config_flags": [], "imports": [], "classes": []}

    functions, flags, imports, classes = [], [], [], []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imports.append(alias.asname or alias.name)
        elif isinstance(node, ast.ClassDef):
            classes.append({"name": node.name, "line": node.lineno, "file": str(relative_path)})
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            positional = list(node.args.posonlyargs) + list(node.args.args)
            defaults = {}
            if node.args.defaults:
                for arg, default in zip(positional[-len(node.args.defaults):], node.args.defaults):
                    defaults[arg.arg] = {"value": literal(default), "line": getattr(default, "lineno", node.lineno)}
            for arg, default in zip(node.args.kwonlyargs, node.args.kw_defaults):
                if default is not None:
                    defaults[arg.arg] = {"value": literal(default), "line": getattr(default, "lineno", node.lineno)}
            functions.append({
                "name": node.name,
                "parameters": [a.arg for a in positional] + [a.arg for a in node.args.kwonlyargs],
                "defaults": defaults,
                "line": node.lineno,
                "file": str(relative_path)
            })
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            value = node.value
            if value is None:
                continue
            for target in targets:
                if isinstance(target, ast.Name) and target.id.isupper() and len(target.id) > 1:
                    flags.append({
                        "name": target.id, "value": literal(value),
                        "line": node.lineno, "file": str(relative_path)
                    })
    return {"functions": functions, "config_flags": flags, "imports": imports, "classes": classes}

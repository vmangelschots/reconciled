"""The tools the MCP endpoint offers, each with its arguments declared once:
the declaration gives the JSON Schema clients see and checks the arguments
before the tool runs. Nothing here knows about HTTP or JSON-RPC, so the
transport can be swapped (issue #79) without touching the tools."""

from dataclasses import dataclass, field

from budgets import utils

from . import format as fmt


class ToolError(Exception):
    """A message for the assistant: what was wrong with its call."""


@dataclass
class Arg:
    name: str
    kind: str  # month, date, year, integer, boolean, string, amount, integer_list
    description: str
    required: bool = False
    minimum: int | None = None
    maximum: int | None = None

    def schema(self):
        base = {
            "month": {"type": "string", "pattern": r"^\d{4}-\d{2}$"},
            "date": {"type": "string", "format": "date"},
            "year": {"type": "integer", "minimum": 1900, "maximum": 2200},
            "integer": {"type": "integer"},
            "boolean": {"type": "boolean"},
            "string": {"type": "string"},
            "amount": {"type": "string", "pattern": r"^-?\d+(\.\d{1,2})?( EUR)?$"},
            "integer_list": {"type": "array", "items": {"type": "integer"}},
        }[self.kind]
        schema = {**base, "description": self.description}
        if self.minimum is not None:
            schema["minimum"] = self.minimum
        if self.maximum is not None:
            schema["maximum"] = self.maximum
        return schema

    def parse(self, value):
        """The value as the tool wants it, or ValueError saying why not."""
        kind = self.kind
        if kind == "month":
            return fmt.parse_month(value)
        if kind == "date":
            return fmt.parse_day(value)
        if kind == "amount":
            return fmt.parse_amount(value)
        if kind == "boolean":
            if not isinstance(value, bool):
                raise ValueError("must be true or false")
            return value
        if kind == "string":
            if not isinstance(value, str):
                raise ValueError("must be text")
            return value
        if kind == "integer_list":
            if not isinstance(value, list) or not all(_is_int(v) for v in value):
                raise ValueError("must be a list of ids")
            return value
        if not _is_int(value):
            raise ValueError("must be a whole number")
        low = self.minimum if self.minimum is not None else (1900 if kind == "year" else None)
        high = self.maximum if self.maximum is not None else (2200 if kind == "year" else None)
        if low is not None and value < low:
            raise ValueError(f"must be at least {low}")
        if high is not None and value > high:
            raise ValueError(f"must be at most {high}")
        return value


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


@dataclass
class Tool:
    name: str
    title: str
    description: str
    handler: object
    args: list = field(default_factory=list)

    def listing(self):
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": {
                "type": "object",
                "properties": {a.name: a.schema() for a in self.args},
                "required": [a.name for a in self.args if a.required],
                "additionalProperties": False,
            },
            # Every tool only reads: see openspec/specs/mcp-server.
            "annotations": {"title": self.title, "readOnlyHint": True, "openWorldHint": False},
        }

    def parse(self, arguments):
        if arguments is None:
            arguments = {}
        if not isinstance(arguments, dict):
            raise ToolError("Arguments must be an object.")
        known = {a.name: a for a in self.args}
        unknown = sorted(set(arguments) - set(known))
        if unknown:
            raise ToolError(f"Unknown argument {unknown[0]!r}. This tool takes: {', '.join(known) or 'nothing'}.")
        parsed = {}
        for arg in self.args:
            value = arguments.get(arg.name)
            if value is None:
                if arg.required:
                    raise ToolError(f"{arg.name} is required.")
                continue
            try:
                parsed[arg.name] = arg.parse(value)
            except ValueError as e:
                raise ToolError(f"{arg.name} {e}.") from None
        return parsed

    def call(self, arguments):
        """Check the arguments, then run. Nothing is read for a bad call."""
        return self.handler(**self.parse(arguments))


TOOLS = {}


def tool(name, title, description, args=()):
    def register(handler):
        TOOLS[name] = Tool(name, title, description.strip(), handler, list(args))
        return handler

    return register


def current_month():
    return utils.today().replace(day=1)

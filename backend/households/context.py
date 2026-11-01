"""The household the current request or job works in. See
openspec/specs/households and design.md of household-tenancy.

Set per request by HasHousehold and per job by household_context. With nothing
set, scoped queries raise (see scoping.py): a forgotten binding fails loudly
instead of reading every household."""

from contextlib import contextmanager
from contextvars import ContextVar

_current = ContextVar("household", default=None)


class NoHousehold(RuntimeError):
    """A scoped query ran with no household bound."""


def current_household():
    household = _current.get()
    if household is None:
        raise NoHousehold("No household is bound. Use household_context.")
    return household


def current_household_or_none():
    return _current.get()


def bind(household):
    """Returns a token for unbind. Prefer household_context."""
    return _current.set(household)


def unbind(token):
    _current.reset(token)


@contextmanager
def household_context(household):
    token = bind(household)
    try:
        yield household
    finally:
        unbind(token)

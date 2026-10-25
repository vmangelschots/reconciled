from django.apps import AppConfig


class TransactionsConfig(AppConfig):
    name = "transactions"

    def ready(self):
        # Registers the signals that keep value adjustments' amounts right.
        from . import adjustments  # noqa: F401

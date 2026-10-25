from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class BackfillImportedAccountsTests(TransactionTestCase):
    before = [("imports", "0003_bank_presets")]
    after = [("imports", "0004_backfill_imported_accounts")]

    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        apps = executor.loader.project_state(self.before).apps
        Account = apps.get_model("accounts", "Account")
        ImportSession = apps.get_model("imports", "ImportSession")
        self.account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.committed = ImportSession.objects.create(
            account=self.account, file_format="csv", raw_content="", status="committed"
        )
        self.pending = ImportSession.objects.create(
            account=self.account, file_format="csv", raw_content="", status="pending"
        )

    def tearDown(self):
        MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_a_committed_session_imported_its_own_account(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.after)
        ImportSession = executor.loader.project_state(self.after).apps.get_model("imports", "ImportSession")

        committed = ImportSession.objects.get(pk=self.committed.pk)
        pending = ImportSession.objects.get(pk=self.pending.pk)
        self.assertEqual(list(committed.imported_accounts.values_list("pk", flat=True)), [self.account.pk])
        self.assertFalse(pending.imported_accounts.exists())

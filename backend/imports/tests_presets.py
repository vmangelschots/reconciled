import csv
import io

from django.test import SimpleTestCase

from .presets import detect_preset, pair_pocket_moves, products_in

REVOLUT_HEADER = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance"
CRELAN_HEADER = (
    "Datum;Bedrag;Saldo na verrichting;Munt;Tegenpartij;Rekening tegenpartij;"
    "Type verrichting;Mededeling;Rekening opdrachtgever"
)

# An excerpt of a real Revolut export: two pocket rows (Savings), the
# other side of the pocket move, and Current card payments, including two
# identical LAGO Mons payments on one day.
REVOLUT_SAMPLE = REVOLUT_HEADER + """
Transfer,Savings,2026-10-12 2:00:00,2026-10-12 13:00:38,Luminus SA,-254.72,0,EUR,COMPLETED,670.9
Transfer,Savings,2026-10-22 19:54:58,2026-10-22 19:54:58,To pocket EUR Electricity from EUR,350,0,EUR,COMPLETED,1020.9
Card Payment,Current,2026-09-30 7:25:54,2026-10-01 9:52:59,Vanalles & Nogwat,-3.6,0,EUR,COMPLETED,144.46
Card Payment,Current,2026-10-11 9:42:55,2026-10-12 10:50:11,LAGO Mons,-7.8,0,EUR,COMPLETED,57.12
Card Payment,Current,2026-10-11 11:01:57,2026-10-12 10:50:11,LAGO Mons,-7.8,0,EUR,COMPLETED,49.32
Transfer,Current,2026-10-22 19:54:58,2026-10-22 19:54:58,To pocket EUR Electricity from EUR,-350,0,EUR,COMPLETED,159.57
Card Payment,Current,2026-10-22 18:00:14,2026-10-23 10:09:10,OPC Parkeren,-22,0,EUR,COMPLETED,135.87
"""


def parse(content, delimiter=","):
    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    return detect_preset(reader.fieldnames).parse(list(reader))


class DetectPresetTests(SimpleTestCase):
    def test_revolut_header(self):
        self.assertEqual(detect_preset(REVOLUT_HEADER.split(",")).key, "revolut")

    def test_crelan_header(self):
        self.assertEqual(detect_preset(CRELAN_HEADER.split(";")).key, "crelan")

    def test_an_extra_column_is_still_recognized(self):
        self.assertEqual(detect_preset(REVOLUT_HEADER.split(",") + ["Category"]).key, "revolut")

    def test_other_headers_are_not_recognized(self):
        self.assertIsNone(detect_preset(["Posted Date", "Amount", "Description"]))


class CrelanRowTests(SimpleTestCase):
    def test_a_row_with_a_counterparty(self):
        [candidate] = parse(
            CRELAN_HEADER + "\n01/10/2026;-21.85;1000.00;EUR;Ethias;BE00 0000 0000 0000;"
            "Overschrijving;Verzekeringstaks;BE11 1111 1111 1111\n",
            ";",
        )
        self.assertEqual(
            candidate,
            {"date": "2026-10-01", "amount_cents": -2185, "description": "Verzekeringstaks", "payee": "Ethias"},
        )

    def test_a_row_without_a_counterparty_or_communication(self):
        [candidate] = parse(CRELAN_HEADER + "\n02/10/2026;-.99;999.01;EUR;;;Beheerskosten;;BE11 1111 1111 1111\n", ";")
        self.assertEqual(candidate["amount_cents"], -99)
        self.assertEqual(candidate["payee"], "Beheerskosten")
        self.assertEqual(candidate["description"], "Beheerskosten")

    def test_the_communication_is_the_payee_without_a_counterparty(self):
        [candidate] = parse(
            CRELAN_HEADER + "\n03/10/2026;-12.00;987.01;EUR;;;Kaartbetaling;Bakkerij Peeters;BE11 1111 1111 1111\n",
            ";",
        )
        self.assertEqual(candidate["payee"], "Bakkerij Peeters")
        self.assertEqual(candidate["description"], "Bakkerij Peeters")


class RevolutRowTests(SimpleTestCase):
    def test_a_card_payment_uses_the_day_it_was_made(self):
        candidates = parse(REVOLUT_SAMPLE)
        vanalles = next(c for c in candidates if c["payee"] == "Vanalles & Nogwat")
        self.assertEqual(
            vanalles,
            {
                "date": "2026-09-30",
                "amount_cents": -360,
                "description": "Vanalles & Nogwat",
                "payee": "Vanalles & Nogwat",
                "product": "Current",
                "started_at": "2026-09-30 7:25:54",
            },
        )

    def test_the_fee_is_part_of_the_amount(self):
        [candidate] = parse(
            REVOLUT_HEADER + "\nCard Payment,Current,2026-10-01 10:00:00,2026-10-01 10:00:01,"
            "Abroad,-50,1.5,EUR,COMPLETED,10\n"
        )
        self.assertEqual(candidate["amount_cents"], -5150)

    def test_unfinished_rows_are_left_out(self):
        content = REVOLUT_HEADER + "".join(
            f"\nCard Payment,Current,2026-10-01 10:00:00,,Shop {state},-5,0,EUR,{state},"
            for state in ("PENDING", "REVERTED", "DECLINED", "COMPLETED")
        )
        self.assertEqual([c["payee"] for c in parse(content)], ["Shop COMPLETED"])

    def test_products_in_file_order(self):
        self.assertEqual(products_in(parse(REVOLUT_SAMPLE)), ["Savings", "Current"])


class PocketPairTests(SimpleTestCase):
    def assign(self, candidates, accounts):
        """Number the candidates and send each Product to an account, the
        way the import view does before pairing."""
        return [
            {**c, "index": i, "account_id": accounts[c["product"]][0], "account_name": accounts[c["product"]][1]}
            for i, c in enumerate(candidates)
        ]

    def test_money_moved_into_a_pocket(self):
        candidates = pair_pocket_moves(
            self.assign(parse(REVOLUT_SAMPLE), {"Current": (1, "Revolut"), "Savings": (2, "Revolut Pockets")})
        )
        into_pocket = next(c for c in candidates if c["amount_cents"] == 35000)
        out_of_current = next(c for c in candidates if c["amount_cents"] == -35000)
        self.assertEqual(into_pocket["pocket_pair"], {"index": out_of_current["index"], "account_name": "Revolut"})
        self.assertEqual(
            out_of_current["pocket_pair"], {"index": into_pocket["index"], "account_name": "Revolut Pockets"}
        )
        self.assertEqual(sum(1 for c in candidates if c["pocket_pair"]), 2)

    def test_a_pocket_paying_a_bill_is_not_paired(self):
        candidates = pair_pocket_moves(
            self.assign(parse(REVOLUT_SAMPLE), {"Current": (1, "Revolut"), "Savings": (2, "Revolut Pockets")})
        )
        luminus = next(c for c in candidates if c["payee"] == "Luminus SA")
        self.assertIsNone(luminus["pocket_pair"])

    def test_rows_on_the_same_account_never_pair(self):
        candidates = pair_pocket_moves(
            self.assign(parse(REVOLUT_SAMPLE), {"Current": (1, "Revolut"), "Savings": (1, "Revolut")})
        )
        self.assertFalse(any(c["pocket_pair"] for c in candidates))

from datetime import date

from django.test import SimpleTestCase

from . import format as fmt


class FormatTests(SimpleTestCase):
    def test_money(self):
        self.assertEqual(fmt.money(-4250), "-42.50 EUR")
        self.assertEqual(fmt.money(240000), "2400.00 EUR")
        self.assertEqual(fmt.money(-5), "-0.05 EUR")
        self.assertEqual(fmt.money(0), "0.00 EUR")
        self.assertIsNone(fmt.money(None))

    def test_dates_and_months(self):
        self.assertEqual(fmt.day(date(2026, 11, 19)), "2026-11-19")
        self.assertEqual(fmt.month(date(2026, 11, 1)), "2026-11")
        self.assertEqual(fmt.parse_month("2026-11"), date(2026, 11, 1))
        for bad in ["2026-13", "2026-1", "nov", "", None, "2026-11-01"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                fmt.parse_month(bad)
        self.assertEqual(fmt.parse_day("2026-11-19"), date(2026, 11, 19))
        with self.assertRaises(ValueError):
            fmt.parse_day("19/11/2026")

    def test_amounts(self):
        self.assertEqual(fmt.parse_amount("-42.50"), -4250)
        self.assertEqual(fmt.parse_amount("10"), 1000)
        self.assertEqual(fmt.parse_amount("-42.50 EUR"), -4250)
        for bad in ["lots", "NaN", "inf"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                fmt.parse_amount(bad)

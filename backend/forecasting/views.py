from datetime import date

from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account

from .models import RecurringTransaction
from .serializers import RecurringTransactionSerializer
from .utils import generate_forecast


class RecurringTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = RecurringTransactionSerializer

    def get_queryset(self):
        queryset = RecurringTransaction.objects.select_related("account", "category").all()
        account_id = self.request.query_params.get("account")
        if account_id:
            queryset = queryset.filter(account_id=account_id)
        return queryset


class ForecastView(APIView):
    def get(self, request):
        account_id = request.query_params.get("account")
        if not account_id:
            return Response({"detail": "account query param is required."}, status=400)
        try:
            account = Account.objects.get(pk=account_id)
        except (Account.DoesNotExist, ValueError):
            return Response({"detail": "Account not found."}, status=404)

        try:
            horizon_days = int(request.query_params.get("horizon_days", 90))
        except ValueError:
            return Response({"detail": "horizon_days must be an integer."}, status=400)
        if horizon_days <= 0:
            return Response({"detail": "horizon_days must be positive."}, status=400)

        forecast = generate_forecast(account, horizon_days, today=date.today())
        return Response(forecast)

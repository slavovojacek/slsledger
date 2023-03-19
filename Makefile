.PHONY: diff
diff:
	cdk diff LedgerDev --profile slsledger

.PHONY: deploy
deploy:
	cdk deploy LedgerDev --profile slsledger

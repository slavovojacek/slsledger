.PHONY: prepare-functions
prepare-functions:
	cd lib/functions && npm install

.PHONY: diff
diff:
	cdk diff LedgerDev --profile slsledger

.PHONY: deploy
deploy:
	cdk deploy LedgerDev --profile slsledger

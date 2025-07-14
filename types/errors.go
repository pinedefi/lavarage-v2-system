package types

import "errors"

// Domain-specific errors
var (
	ErrMissingID                = errors.New("missing margin offer ID")
	ErrMissingCollateralToken   = errors.New("missing collateral token")
	ErrMissingBorrowToken       = errors.New("missing borrow token")
	ErrInvalidBorrowAmount      = errors.New("invalid borrow amount: must be non-negative")
	ErrInvalidMaxOpenLTV        = errors.New("invalid max open LTV: must be between 0 and 1")
	ErrInvalidLiquidationLTV    = errors.New("invalid liquidation LTV: must be between 0 and 1")
	ErrInvalidLTVRatio          = errors.New("invalid LTV ratio: liquidation LTV must be greater than max open LTV")
	ErrInvalidInterestRate      = errors.New("invalid interest rate: must be non-negative")
	ErrMissingLiquiditySource   = errors.New("missing liquidity source")
	ErrOfferNotFound           = errors.New("margin offer not found")
	ErrOfferAlreadyExists      = errors.New("margin offer already exists")
	ErrInvalidOfferType        = errors.New("invalid offer type")
	ErrInvalidInterestModel    = errors.New("invalid interest model")
	ErrOfferExpired            = errors.New("margin offer has expired")
	ErrInsufficientLiquidity   = errors.New("insufficient liquidity available")
	ErrUnauthorizedAccess      = errors.New("unauthorized access to margin offer")
	ErrInvalidPaginationParams = errors.New("invalid pagination parameters")
	ErrInternalServerError     = errors.New("internal server error")
	ErrServiceUnavailable      = errors.New("service temporarily unavailable")
	
	// Position-specific errors
	ErrMissingUserAddress       = errors.New("missing user address")
	ErrMissingOfferID           = errors.New("missing offer ID")
	ErrInvalidCollateralAmount  = errors.New("invalid collateral amount: must be non-negative")
	ErrInvalidBorrowedAmount    = errors.New("invalid borrowed amount: must be non-negative")
	ErrInvalidCurrentLTV        = errors.New("invalid current LTV: must be between 0 and 1")
	ErrInvalidMaxLTV            = errors.New("invalid max LTV: must be between 0 and 1")
	ErrMissingStatus            = errors.New("missing position status")
	ErrPositionNotFound         = errors.New("position not found")
	ErrPositionAlreadyExists    = errors.New("position already exists")
	ErrInvalidPositionStatus    = errors.New("invalid position status")
	ErrPositionNotActive        = errors.New("position is not active")
	ErrPositionAlreadyClosed    = errors.New("position is already closed")
	ErrPositionAlreadyLiquidated = errors.New("position is already liquidated")
)

// Store errors
var (
	ErrStoreNotInitialized = errors.New("store not initialized")
	ErrStoreConnectionLost = errors.New("store connection lost")
	ErrConcurrentModification = errors.New("concurrent modification detected")
	ErrBulkOperationFailed = errors.New("bulk operation failed")
)

// ETL Pipeline errors
var (
	ErrChainConnectionFailed = errors.New("failed to connect to blockchain")
	ErrEventProcessingFailed = errors.New("failed to process blockchain event")
	ErrInvalidEventData     = errors.New("invalid event data received")
	ErrETLPipelineStopped   = errors.New("ETL pipeline has stopped")
)

// Backfiller errors
var (
	ErrBackfillSourceUnavailable = errors.New("backfill data source unavailable")
	ErrBackfillDataCorrupted     = errors.New("backfill data is corrupted")
	ErrBackfillTimeout           = errors.New("backfill operation timed out")
	ErrInvalidBackfillRange      = errors.New("invalid backfill time range")
)

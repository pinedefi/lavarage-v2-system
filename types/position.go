package types

import (
	"time"
)

// PositionStatus represents the status of a position
type PositionStatus string

const (
	PositionStatusActive     PositionStatus = "active"
	PositionStatusLiquidated PositionStatus = "liquidated"
	PositionStatusClosed     PositionStatus = "closed"
	PositionStatusPending    PositionStatus = "pending"
)

// MarginPosition represents a margin trading position
type MarginPosition struct {
	ID                  string         `json:"id" bson:"_id"`
	UserAddress         string         `json:"user_address" bson:"user_address"`
	OfferID             string         `json:"offer_id" bson:"offer_id"`
	CollateralToken     string         `json:"collateral_token" bson:"collateral_token"`
	BorrowToken         string         `json:"borrow_token" bson:"borrow_token"`
	CollateralAmount    float64        `json:"collateral_amount" bson:"collateral_amount"`
	BorrowedAmount      float64        `json:"borrowed_amount" bson:"borrowed_amount"`
	CurrentLTV          float64        `json:"current_ltv" bson:"current_ltv"`
	MaxLTV              float64        `json:"max_ltv" bson:"max_ltv"`
	LiquidationLTV      float64        `json:"liquidation_ltv" bson:"liquidation_ltv"`
	InterestRate        float64        `json:"interest_rate" bson:"interest_rate"`
	InterestModel       InterestModel  `json:"interest_model" bson:"interest_model"`
	Status              PositionStatus `json:"status" bson:"status"`
	CreatedTimestamp    time.Time      `json:"created_timestamp" bson:"created_timestamp"`
	UpdatedTimestamp    time.Time      `json:"updated_timestamp" bson:"updated_timestamp"`
	LiquidatedTimestamp *time.Time     `json:"liquidated_timestamp,omitempty" bson:"liquidated_timestamp,omitempty"`
	ClosedTimestamp     *time.Time     `json:"closed_timestamp,omitempty" bson:"closed_timestamp,omitempty"`
	LiquidatorAddress   *string        `json:"liquidator_address,omitempty" bson:"liquidator_address,omitempty"`
	LiquidationPenalty  *float64       `json:"liquidation_penalty,omitempty" bson:"liquidation_penalty,omitempty"`
	Source              *string        `json:"source,omitempty" bson:"source,omitempty"`
	TxBuilderWire       *string        `json:"txbuilderwire,omitempty" bson:"txbuilderwire,omitempty"` // Arbitrary data (e.g., JSON) for transaction builder
}

// Validate performs basic validation on the MarginPosition
func (p *MarginPosition) Validate() error {
	if p.ID == "" {
		return ErrMissingID
	}
	if p.UserAddress == "" {
		return ErrMissingUserAddress
	}
	if p.OfferID == "" {
		return ErrMissingOfferID
	}
	if p.CollateralToken == "" {
		return ErrMissingCollateralToken
	}
	if p.BorrowToken == "" {
		return ErrMissingBorrowToken
	}
	if p.CollateralAmount < 0 {
		return ErrInvalidCollateralAmount
	}
	if p.BorrowedAmount < 0 {
		return ErrInvalidBorrowedAmount
	}
	if p.CurrentLTV < 0 || p.CurrentLTV > 1 {
		return ErrInvalidCurrentLTV
	}
	if p.MaxLTV < 0 || p.MaxLTV > 1 {
		return ErrInvalidMaxLTV
	}
	if p.LiquidationLTV < 0 || p.LiquidationLTV > 1 {
		return ErrInvalidLiquidationLTV
	}
	if p.LiquidationLTV <= p.MaxLTV {
		return ErrInvalidLTVRatio
	}
	if p.InterestRate < 0 {
		return ErrInvalidInterestRate
	}
	if p.Status == "" {
		return ErrMissingStatus
	}
	return nil
}

// UpdateTimestamp updates the UpdatedTimestamp field to the current time
func (p *MarginPosition) UpdateTimestamp() {
	p.UpdatedTimestamp = time.Now().UTC()
}

// IsActive checks if the position is active
func (p *MarginPosition) IsActive() bool {
	return p.Status == PositionStatusActive
}

// IsLiquidated checks if the position has been liquidated
func (p *MarginPosition) IsLiquidated() bool {
	return p.Status == PositionStatusLiquidated
}

// IsClosed checks if the position has been closed
func (p *MarginPosition) IsClosed() bool {
	return p.Status == PositionStatusClosed
}

// IsPending checks if the position is pending
func (p *MarginPosition) IsPending() bool {
	return p.Status == PositionStatusPending
}

// IsAtRisk checks if the position is at risk of liquidation
func (p *MarginPosition) IsAtRisk() bool {
	return p.IsActive() && p.CurrentLTV >= p.LiquidationLTV
}

// GetEffectiveLTV returns the effective LTV based on current state
func (p *MarginPosition) GetEffectiveLTV() float64 {
	if p.CollateralAmount == 0 {
		return 0
	}
	return p.BorrowedAmount / p.CollateralAmount
}

// Clone creates a deep copy of the MarginPosition
func (p *MarginPosition) Clone() *MarginPosition {
	clone := *p
	if p.LiquidatedTimestamp != nil {
		liquidated := *p.LiquidatedTimestamp
		clone.LiquidatedTimestamp = &liquidated
	}
	if p.ClosedTimestamp != nil {
		closed := *p.ClosedTimestamp
		clone.ClosedTimestamp = &closed
	}
	if p.LiquidatorAddress != nil {
		liquidator := *p.LiquidatorAddress
		clone.LiquidatorAddress = &liquidator
	}
	if p.LiquidationPenalty != nil {
		penalty := *p.LiquidationPenalty
		clone.LiquidationPenalty = &penalty
	}
	if p.Source != nil {
		source := *p.Source
		clone.Source = &source
	}
	if p.TxBuilderWire != nil {
		txBuilderWire := *p.TxBuilderWire
		clone.TxBuilderWire = &txBuilderWire
	}
	return &clone
}

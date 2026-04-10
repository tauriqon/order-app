# 커피 주문 앱 (Coffee Order App) PRD

## 1. 프로젝트 개요

### 1.1 프로젝트명
커피 주문 앱

### 1.2 프로젝트 목적
사용자가 커피 메뉴를 주문하고, 관리자가 주문을 관리할 수 있는 간단한 풀스택 웹 앱

### 1.3 개발 범위
- 주문하기 화면 (메뉴 선택 및 장바구니 기능)
- 관리자 화면 (재고 관리 및 주문 상태 관리)
- 데이터를 생성/조회/수정/삭제할 수 있는 기능

---

## 2. 기술 스택
- **프런트엔드**: HTML, CSS, React, JavaScript
- **데이터베이스/백엔드 아키텍처**: Supabase (BaaS, 서버리스)

## 3. 기본 사항
- 프런트엔드(React) 앱에서 API를 거치지 않고 직접 Supabase 데이터베이스와 통신하는 BaaS 패턴으로 통합 개발
- 기본적인 웹 기술만 사용하며, 모던하고 미려한 디자인(Vanilla CSS 기반) 적용
- 학습 목적이므로 사용자 인증이나 결제 기능은 제외
- 메뉴는 특화된 형태의 '커피 메뉴'로만 한정

---

## 4. 프런트엔드 요구사항 - 주문하기 화면 (`/`)

### 4.1 화면 목적
사용자가 커피 메뉴를 선택하고 옵션을 적용해 장바구니에 담으며, 장바구니 리스트와 총액 확인 후 주문 요청을 보냄

### 4.2 화면 구성
1. **상단 헤더**: 브랜드명(좌), 탭/버튼(`주문하기` / `관리자`)(우)
2. **메뉴 리스트**: 1행 3카드의 그리드 구성 (이미지, 이름, 가격, 설명, 옵션 체크박스(샷/시럽), 담기 버튼)
3. **장바구니 영역**: 메뉴 항목별 1열 리스트 표시 (이름, 옵션, 수량, 단위기격, 총계 및 `주문하기` 버튼)

### 4.3 기능 요구사항 (FR)
- **FR-01**: 메뉴 목록 초기 로드 (이름, 가격, 옵션, 이미지) 표시. 화폐는 ',000원' 포맷팅.
- **FR-02**: 메뉴 카드 내 옵션 (샷 추가+500원, 시럽+0원) 독립 선택 구현.
- **FR-03**: 메뉴+옵션 조합 기준으로 장바구니 아이템 추가(새로 추가 혹은 수량+1).
- **FR-04**: 장바구니 소계 및 총 금액 즉시 반영.
- **FR-05**: 주문하기 버튼을 통한 주문 데이터 변환 및 서버 요청. 성공 시 초기화. 실패 시 유지.
- **FR-06**: 빈 메뉴 및 통신 에러 등에 대한 예외처리(메시지 등).

### 4.4 데이터 모델
```typescript
interface Menu { id: string; name: string; price: number; description: string; imageUrl: string|null; }
interface CartItem { menuId: string; menuName: string; basePrice: number; options: { extraShot: boolean; syrup: boolean }; unitPrice: number; quantity: number; subtotal: number; }
interface OrderPayload { items: CartItem[]; totalPrice: number; orderedAt: string(ISO); }
```

---

## 5. 프런트엔드 요구사항 - 관리자 화면 (`/admin`)

### 5.1 화면 목적
매장 운영 상태 한눈에 파악, 재고 조회/수정 및 주문 처리 상태 전이 관리

### 5.2 화면 구성
1. **헤더**: 글로벌 공통 헤더
2. **대시보드**: 주문 집계 (총 주문, 접수, 제조 중, 완료) 4개 카드
3. **재고 현황**: 개별 메뉴 재고 표시 및 `+`, `-` 버튼
4. **주문 현황**: 주문 목록(최신순), 각 주문별 상태 셀렉터 버튼

### 5.3 기능 요구사항 (FR)
- **FR-01**: 4가지 핵심 통계 지표 표시 및 갱신.
- **FR-02 & FR-03**: 재고 현황 표시, +/ - 버튼으로 증감(음수 불가), DB 실시간 업데이트.
- **FR-04 & FR-05**: 전체 주문 리스트 표시, 각 주문 단계별 한 방향 전이 가능 (접수 -> 제조 중 -> 완료).  
  - 제조 완료 시 추가 변경 불가 조치
- **FR-06**: 데이터 없음, 통신 지연 등에 대한 피드백 UI 구성.

### 5.4 데이터 모델
```typescript
interface StockItem { menuId: string; menuName: string; stock: number; }
interface AdminOrder { orderId: string; orderedAt: string(ISO); itemsSummary: string; totalPrice: number; status: "주문 접수" | "제조 중" | "제조 완료"; }
interface OrderDashboard { totalCount: number; receivedCount: number; inProgressCount: number; completedCount: number; }
```

### 5.5 비기능 요구사항 / UI 요건 (공통)
- 1초 이내 로딩 목표. 로딩 상태 최적화
- 미려하고 매력적인 **"Dark/Light & Glassmorphism"** 디자인 채택
- 데스크탑 기준 레이아웃 최적화. 카드, 버튼 등 인터렉티브 마이크로 애니메이션 추가
- 버튼 연속 클릭 방지와 오류에 의한 데이터 훼손 방지

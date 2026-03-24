from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from backend.app.schemas.common import ApiModel, OperationImpact


Natureza = Literal["MATERIAL", "SERVICO", "ALUGUER", "TRANSPORTE", "GASOLEO", "GASOLINA"]
UsoCombustivel = Literal["N/A", "VIATURA", "MAQUINA", "GERADOR"]
OrigemAfetacao = Literal["STOCK", "FATURA_DIRETA"]
TipoMovimento = Literal["ENTRADA", "CONSUMO"]
TipoDocFatura = Literal["FATURA", "NOTA_CREDITO"]
TipoDocCompromisso = Literal["PRO_FORMA", "ORCAMENTO", "ADJUDICACAO"]
EstadoCompromisso = Literal["ABERTO", "PARCIALMENTE_PAGO", "PAGO"]
CategoriaNotaCredito = Literal["NC_COM_OBRA", "NC_SEM_OBRA"]


class CompromissoCreate(ApiModel):
    data: date
    fornecedor: str
    nif: str
    tipo_doc: TipoDocCompromisso
    doc_origem: str
    obra: str
    fase: str
    descricao: str
    valor_sem_iva: float = 0
    iva: float = 0
    valor_com_iva: float = 0
    estado: EstadoCompromisso = "ABERTO"
    observacoes: str | None = None


class CompromissoUpdate(ApiModel):
    data: date | None = None
    fornecedor: str | None = None
    nif: str | None = None
    tipo_doc: TipoDocCompromisso | None = None
    doc_origem: str | None = None
    obra: str | None = None
    fase: str | None = None
    descricao: str | None = None
    valor_sem_iva: float | None = None
    iva: float | None = None
    valor_com_iva: float | None = None
    estado: EstadoCompromisso | None = None
    observacoes: str | None = None


class CompromissoRecord(ApiModel):
    id_compromisso: str
    data: date
    fornecedor: str
    nif: str
    tipo_doc: TipoDocCompromisso
    doc_origem: str
    obra: str
    fase: str
    descricao: str
    valor_sem_iva: float = 0
    iva: float = 0
    valor_com_iva: float = 0
    estado: EstadoCompromisso = "ABERTO"
    observacoes: str | None = None
    created_at: datetime
    updated_at: datetime


class FaturaCreate(ApiModel):
    tipo_doc: TipoDocFatura = "FATURA"
    doc_origem: str | None = None
    id_compromisso: str | None = None
    fornecedor: str
    nif: str
    nr_documento: str
    data_fatura: date
    valor_sem_iva: float = 0
    iva: float = 0
    valor_com_iva: float = 0
    paga: bool = False
    data_pagamento: date | None = None
    observacoes: str | None = None


class FaturaUpdate(ApiModel):
    tipo_doc: TipoDocFatura | None = None
    doc_origem: str | None = None
    id_compromisso: str | None = None
    fornecedor: str | None = None
    nif: str | None = None
    nr_documento: str | None = None
    data_fatura: date | None = None
    valor_sem_iva: float | None = None
    iva: float | None = None
    valor_com_iva: float | None = None
    paga: bool | None = None
    data_pagamento: date | None = None
    observacoes: str | None = None
    estado: str | None = None


class FaturaRecord(ApiModel):
    id_fatura: str
    tipo_doc: TipoDocFatura = "FATURA"
    doc_origem: str | None = None
    id_compromisso: str | None = None
    fornecedor: str
    nif: str
    nr_documento: str
    data_fatura: date
    valor_sem_iva: float = 0
    iva: float = 0
    valor_com_iva: float = 0
    paga: bool = False
    data_pagamento: date | None = None
    observacoes: str | None = None
    estado: str = "ATIVA"
    created_at: datetime
    updated_at: datetime


class FaturaItemCreate(ApiModel):
    descricao_original: str
    quantidade: float
    custo_unit: float
    iva: float = 0
    destino: str
    obra: str | None = None
    fase: str | None = None
    desconto_1: float = 0
    desconto_2: float = 0
    id_item: str | None = None
    item_oficial: str | None = None
    unidade: str | None = None
    natureza: Natureza | None = None
    uso_combustivel: UsoCombustivel | None = None
    matricula: str | None = None
    observacoes: str | None = None


class NotaCreditoItemCreate(ApiModel):
    descricao_original: str
    quantidade: float
    custo_unit: float
    iva: float = 0
    categoria_nota_credito: CategoriaNotaCredito
    obra: str | None = None
    fase: str | None = None
    id_item: str | None = None
    item_oficial: str | None = None
    unidade: str | None = None
    natureza: Natureza | None = None
    observacoes: str | None = None


class FaturaItemsCreateRequest(ApiModel):
    items: list[FaturaItemCreate]


class NotaCreditoItemsCreateRequest(ApiModel):
    items: list[NotaCreditoItemCreate]


class FaturaItemUpdate(ApiModel):
    descricao_original: str | None = None
    id_item: str | None = None
    item_oficial: str | None = None
    unidade: str | None = None
    natureza: Natureza | None = None
    uso_combustivel: UsoCombustivel | None = None
    matricula: str | None = None
    quantidade: float | None = None
    custo_unit: float | None = None
    iva: float | None = None
    destino: str | None = None
    obra: str | None = None
    fase: str | None = None
    desconto_1: float | None = None
    desconto_2: float | None = None
    observacoes: str | None = None


class NotaCreditoItemUpdate(ApiModel):
    descricao_original: str | None = None
    id_item: str | None = None
    item_oficial: str | None = None
    unidade: str | None = None
    natureza: Natureza | None = None
    quantidade: float | None = None
    custo_unit: float | None = None
    iva: float | None = None
    categoria_nota_credito: CategoriaNotaCredito | None = None
    obra: str | None = None
    fase: str | None = None
    observacoes: str | None = None


class FaturaItemRecord(ApiModel):
    id_item_fatura: str
    id_fatura: str
    fornecedor: str | None = None
    nif: str | None = None
    nr_documento: str | None = None
    data_fatura: date | None = None
    descricao_original: str
    id_item: str | None = None
    item_oficial: str | None = None
    unidade: str | None = None
    natureza: Natureza | None = None
    uso_combustivel: UsoCombustivel | None = None
    matricula: str | None = None
    quantidade: float
    custo_unit: float
    desconto_1: float = 0
    desconto_2: float = 0
    custo_total_sem_iva: float = 0
    iva: float = 0
    custo_total_com_iva: float = 0
    destino: str
    obra: str | None = None
    fase: str | None = None
    observacoes: str | None = None
    estado_mapeamento: str = "GUARDADO"
    created_at: datetime
    updated_at: datetime


class NotaCreditoItemRecord(ApiModel):
    id_item_nota_credito: str
    id_fatura: str
    fornecedor: str | None = None
    nif: str | None = None
    nr_documento: str | None = None
    doc_origem: str | None = None
    data_fatura: date | None = None
    descricao_original: str
    id_item: str | None = None
    item_oficial: str | None = None
    unidade: str | None = None
    natureza: Natureza | None = None
    quantidade: float
    custo_unit: float
    custo_total_sem_iva: float = 0
    iva: float = 0
    custo_total_com_iva: float = 0
    categoria_nota_credito: CategoriaNotaCredito
    obra: str | None = None
    fase: str | None = None
    estado: str = "GUARDADO"
    observacoes: str | None = None
    created_at: datetime
    updated_at: datetime


class CatalogEntryCreate(ApiModel):
    item_oficial: str
    natureza: Natureza
    unidade: str
    observacoes: str | None = None
    descricao_original: str | None = None


class CatalogEntryUpdate(ApiModel):
    item_oficial: str | None = None
    natureza: Natureza | None = None
    unidade: str | None = None
    observacoes: str | None = None
    estado_cadastro: str | None = None


class CatalogEntryRecord(ApiModel):
    id_item: str
    item_oficial: str
    natureza: Natureza
    unidade: str
    observacoes: str | None = None
    estado_cadastro: str = "ATIVO"
    referencias: list[str] = Field(default_factory=list)
    reference_count: int = 0
    created_at: datetime
    updated_at: datetime


class CatalogReferenceRecord(ApiModel):
    id_referencia: str
    descricao_original: str
    id_item: str
    observacoes: str | None = None
    estado_referencia: str = "ATIVA"
    created_at: datetime
    updated_at: datetime


class AfetacaoCreate(ApiModel):
    origem: OrigemAfetacao = "STOCK"
    source_id: str | None = None
    data: date
    id_item: str
    quantidade: float
    iva: float = 0
    obra: str
    fase: str
    uso_combustivel: UsoCombustivel | None = None
    observacoes: str | None = None
    processar: bool = False


class AfetacaoUpdate(ApiModel):
    data: date | None = None
    id_item: str | None = None
    quantidade: float | None = None
    iva: float | None = None
    obra: str | None = None
    fase: str | None = None
    uso_combustivel: UsoCombustivel | None = None
    observacoes: str | None = None
    processar: bool | None = None


class AfetacaoRecord(ApiModel):
    id_afetacao: str
    origem: OrigemAfetacao
    source_id: str | None = None
    data: date
    id_item: str
    item_oficial: str | None = None
    natureza: Natureza | None = None
    uso_combustivel: UsoCombustivel | None = None
    quantidade: float
    unidade: str | None = None
    custo_unit: float = 0
    custo_total: float = 0
    custo_total_sem_iva: float = 0
    iva: float = 0
    custo_total_com_iva: float = 0
    obra: str
    fase: str
    fornecedor: str | None = None
    nif: str | None = None
    nr_documento: str | None = None
    processar: bool = False
    estado: str = "RASCUNHO"
    observacoes: str | None = None
    created_at: datetime
    updated_at: datetime


class MovimentoRecord(ApiModel):
    id_mov: str
    tipo: TipoMovimento
    data: date
    id_item: str
    item_oficial: str
    unidade: str | None = None
    uso_combustivel: UsoCombustivel | None = None
    matricula: str | None = None
    quantidade: float
    custo_unit: float = 0
    custo_total_sem_iva: float = 0
    iva: float = 0
    custo_total_com_iva: float = 0
    obra: str | None = None
    fase: str | None = None
    fornecedor: str | None = None
    nif: str | None = None
    nr_documento: str | None = None
    observacoes: str | None = None
    source_type: str
    source_id: str
    created_at: datetime
    updated_at: datetime
    sequence: int


class FaturaDetail(ApiModel):
    fatura: FaturaRecord
    items: list[FaturaItemRecord | NotaCreditoItemRecord]


class FaturaItemsResponse(ApiModel):
    items: list[FaturaItemRecord]
    impacts: list[OperationImpact]


class NotaCreditoItemsResponse(ApiModel):
    items: list[NotaCreditoItemRecord]
    impacts: list[OperationImpact]

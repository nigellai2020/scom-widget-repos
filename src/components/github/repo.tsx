import { Module, Container, Styles, VStack, Label, Icon, customElements, ControlElement, Button, HStack, Modal, Input, Tabs, Tab, Pagination, Datepicker, moment, Alert } from "@ijstech/components";
import { compareVersions, createNewPackage, createNewPackageVersion, getAllPulls, getAuditPRList, getCommits, getExplorerTxUrl, getMergeMsg, getPackageByNames, getTimeAgo, mergePR, parseContractError, requestAuditCommit, syncCommits, updatePackageVersionIpfsCid, updatePackageVersionToAuditing, uploadDataToIpfs } from "../../utils/index";
import { inputDateStyle, inputStyle, modalStyle, childTabStyle } from "./index.css";
import { ICommit, ISemanticVersion, PackageStatus } from "../../interface";
import { Wallet } from "@ijstech/eth-wallet";
import { ScomWidgetReposAuditReport } from '../../components/index';
const Theme = Styles.Theme.ThemeVars;

interface GithubRepoElement extends ControlElement {
  data?: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ['i-scom-widget-repos--github-repo']: GithubRepoElement;
    }
  }
}

@customElements('i-scom-widget-repos--github-repo')
export class ScomWidgetReposGithubRepo extends Module {
  private _data: any;
  private _guid: string;
  private _projectId: number;
  private _isProject: boolean;
  private _isProjectOwner: boolean;
  private _isAuditPR: boolean;
  private _isGithubOwner: boolean;
  private isInitialized: boolean;
  private lastCommitId: string;
  private listPR: any[] = [];
  private isDetailShown = false;
  private listAuditPr: any[] = [];
  private timer: any;
  private listTimer: any[] = [];
  private commits: ICommit[] = [];
  private totalCommits: number = 0;
  private packageInfo: any;

  private lbName: Label;
  private lbPath: Label;
  private lbVersion: Label;
  private lbCount: Label;
  private lbPushedAt: Label;
  private iconDetail: Icon;
  private iconRefresh: Icon;
  private hStackCount: HStack;
  private hStackLink: HStack;
  private tabs: Tabs;
  private tabPRs: Tab;
  private tabCommits: Tab;
  private vStackListPR: VStack;
  private vStackListCommit: VStack;
  private pageSize = 5;
  private pagiCommitList: Pagination;
  private inputCommitId: Input;
  private inputMessage: Input;
  private inputStartDate: Datepicker;
  private inputEndDate: Datepicker;
  private lbStartDateErr: Label;
  private lbEndDateErr: Label;
  private btnSync: Button;
  private btnSearch: Button;
  private btnClear: Button;
  private mdAlert: Alert;
  private viewReportModal: Modal;
  private auditReport: ScomWidgetReposAuditReport;

  private selectedCommit: { commitGuid: string, packageGuid: string, version: string, sha: string };
  private mdPublish: Modal;
  private lbCommitId: Label;
  private lbCommitVersion: Label;
  private btnPublish: Button;
  private lbPublish: Label;
  public onRefresh: () => Promise<void>;
  public updateCountPRs: (oldNum: number, newNum: number) => void;
  public onEdit: (name: string) => void;

  set guid(value: string) {
    this._guid = value;
  }

  get guid() {
    return this._guid;
  }

  set projectId(value: number) {
    this._projectId = value;
  }

  get projectId() {
    return this._projectId;
  }

  set isProject(value: boolean) {
    this._isProject = value;
  }

  get isProject() {
    return this._isProject;
  }

  set isProjectOwner(value: boolean) {
    this._isProjectOwner = value;
  }

  get isProjectOwner() {
    return this._isProjectOwner;
  }

  set isGithubOwner(value: boolean) {
    this._isGithubOwner = value;
  }

  get isGithubOwner() {
    return this._isGithubOwner;
  }

  set data(value: any) {
    this._data = value;
    this.renderUI();
  }

  get data() {
    return this._data || {};
  }

  get isAuditPR() {
    return this._isAuditPR;
  }

  set isAuditPR(value: boolean) {
    this._isAuditPR = value;
  }

  constructor(parent?: Container, options?: GithubRepoElement) {
    super(parent, options);
  }

  private setMessage(message: {status?: string, content?: string, title?: string, link?: any, onClose?: any, onConfirm?: any}) {
    const { status, content, title, link, onClose, onConfirm } = message;
    if (title !== undefined) this.mdAlert.title = title;
    if (content !== undefined) this.mdAlert.content = content;
    if (status !== undefined) this.mdAlert.status = status;
    if (link) this.mdAlert.link = link;
    if (typeof onClose === 'function') this.mdAlert.onClose = onClose;
    if (typeof onConfirm === 'function') this.mdAlert.onConfirm = onConfirm;
  }

  private async renderUI() {
    if (!this.isInitialized || !this.data) return;
    const { name, owner_login, open_issues, html_url, pushed_at, full_name, version } = this.data;
    this.packageInfo = await getPackageByNames(owner_login, name);
    this.lbName.caption = name;
    this.lbPublish.caption = `Publish ${name} repository`;
    this.lbPath.caption = full_name;
    this.lbVersion.caption = version || '-';
    const hasPR = open_issues > 0;
    this.lbCount.caption = `${open_issues}`;
    this.tabPRs.caption = `PRs <span style="color: var(--colors-primary-main)">(${open_issues})</span>`;
    this.lbCount.background = { color: hasPR ? Theme.colors.primary.main : Theme.colors.info.main };
    this.hStackCount.cursor = hasPR ? 'pointer' : 'default';
    this.hStackCount.onClick = () => hasPR ? this.onShowDetail() : {};
    this.hStackLink.onClick = () => this.openLink(html_url);
    this.lbPushedAt.caption = `Updated ${getTimeAgo(pushed_at)}`;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.lbPushedAt.caption = `Updated ${getTimeAgo(pushed_at)}`;
    }, 60000);
  }

  private clearListTimer() {
    for (const item of this.listTimer) {
      clearInterval(item);
    }
    this.listTimer = [];
  }

  private renderListPR() {
    this.lbCount.caption = `${this.listPR.length}`;
    const hasPR = this.listPR.length > 0;
    this.lbCount.background = { color: hasPR ? Theme.colors.primary.main : Theme.colors.info.main };
    this.hStackCount.cursor = hasPR ? 'pointer' : 'default';
    this.hStackCount.onClick = () => hasPR ? this.onShowDetail() : {};
    this.clearListTimer();
    let nodeItems: HTMLElement[] = [];
    for (const pr of this.listPR) {
      const { mergeId, html_url, number, title, created_at, user_login, base, status } = pr;
      const lbTimer = new Label(undefined, {
        caption: `#${number} opened ${getTimeAgo(created_at)} by ${user_login}`,
        font: { size: '0.75rem' },
        opacity: 0.8
      });
      const interval = setInterval(() => {
        lbTimer.caption = `#${number} opened ${getTimeAgo(created_at)} by ${user_login}`;
      }, 60000);
      this.listTimer.push(interval);
      nodeItems.push(<i-hstack
        gap="0.625rem"
        margin={{ bottom: '1rem' }}
        padding={{ top: '0.75rem', bottom: '0.75rem', left: '0.75rem', right: '0.75rem' }}
        background={{ color: 'linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.07))' }}
        boxShadow="0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)"
        border={{ radius: '0.375rem' }}
        verticalAlignment="center"
        horizontalAlignment="space-between"
      >
        <i-vstack gap="0.5rem" verticalAlignment="center" maxWidth="calc(100% - 200px)">
          <i-hstack gap="0.5rem">
            <i-label caption={title} wordBreak="break-word" font={{ size: '0.8  75rem', bold: true }} />
            <i-icon name="external-link-alt" class="icon-hover" cursor="pointer" width="0.9rem" height="0.9rem" onClick={() => this.openLink(html_url)} />
          </i-hstack>
          {lbTimer}
        </i-vstack>
        <i-hstack gap="1rem" verticalAlignment="center">
          <i-label
            caption={this.getStatusText(status, true)}
            font={{ size: '0.875rem' }}
            background={{ color: this.getStatusColor(status) }}
            border={{ radius: '1rem' }}
            padding={{ left: '0.625rem', right: '0.625rem', top: '0.3125rem', bottom: '0.3125rem' }}
            minWidth={'5.5rem'}
            class="text-center"
          />
          {status !== PackageStatus.AUDITING ? <i-button
            caption="View Record"
            background={{ color: '#212128' }}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            rightIcon={{ spin: true, visible: false }}
            onClick={() => this.onViewRecord(mergeId, base.base_login, base.base_name, number)}
          /> : []}
          {this.isAuditPR && status === PackageStatus.AUDITING ? <i-button
            caption={'Review'}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            rightIcon={{ spin: true, visible: false }}
            onClick={() => this.onAuditPR(base.base_login, base.base_name, number)}
          /> : []}
          {this.isGithubOwner || this.isProjectOwner ? <i-button
            caption={'Merge'}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            rightIcon={{ spin: true, visible: false }}
            onClick={(btn: Button) => this.onMergePR(btn, base.base_login, base.base_name, number, status)}
          /> : []}
        </i-hstack>
      </i-hstack>);
    }
    if (!nodeItems.length) {
      nodeItems.push(<i-hstack
        gap="0.625rem"
        margin={{ bottom: '1rem' }}
        padding={{ top: '0.75rem', bottom: '0.75rem', left: '0.75rem', right: '0.75rem' }}
        background={{ color: 'linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.07))' }}
        boxShadow="0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)"
        border={{ radius: '0.375rem' }}
        verticalAlignment="center"
        horizontalAlignment="center"
      >
        <i-label caption="There is no pull request" />
      </i-hstack>)
    }
    this.vStackListPR.clearInnerHTML();
    this.vStackListPR.append(...nodeItems);
  }

  private getStatusMessage(status: PackageStatus, prNumber: number, repo: string) {
    let text = `Are you sure you want to merge #${prNumber} in ${repo}?`;
    if (!this.guid) return text;
    switch (status) {
      case PackageStatus.AUDITING:
        text = `<span style="color: ${Theme.colors.warning.main}">This PR is not reviewed by the auditor yet. ${text}</span>`;
        break;
      case PackageStatus.AUDIT_FAILED:
        text = `<span style="color: ${Theme.colors.error.main}">This PR has been audited with failed status. ${text}</span>`;
        break;
    }
    return text;
  }

  private getStatusColor(status: PackageStatus) {
    let color: string;
    if (!status) return Theme.colors.warning.main;
    switch (status) {
      case PackageStatus.AUDIT_PASSED: {
        color = Theme.colors.success.main;
        break;
      }
      case PackageStatus.AUDITING: {
        color = Theme.colors.warning.main;
        break;
      }
      case PackageStatus.AUDIT_FAILED: {
        color = Theme.colors.error.main;
        break;
      }
    }
    return color;
  }

  private getStatusText(status: PackageStatus, isPR?: boolean, isDefault?: boolean) {
    let text = '';
    switch (status) {
      case PackageStatus.AUDITING:
        text = isPR ? "Pending Review" : "Pending Audit";
        break;
      case PackageStatus.AUDIT_PASSED:
        if (isDefault) return "Submit for Audit";
        text = isPR ? "Passed Review" : "Audit Passed";
        break;
      case PackageStatus.AUDIT_FAILED:
        if (isDefault) return "Submit for Audit";
        text = isPR ? "Failed Review" : "Audit Failed";
        break;
      default:
        text = isPR ? "Pending Review" : "Submit for Audit";
    }
    return text;
  }

  private onStartDateChanged = (elm: Datepicker) => {
    const value = elm?.value;
    const inputEndDate = this.inputEndDate.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    this.lbStartDateErr.caption = '';
    this.lbEndDateErr.caption = '';
    if (inputEndDate) {
      if (value) {
        const date = moment(value, 'DD/MM/YYYY HH:mm');
        const val = date;
        inputEndDate.min = val.format('YYYY-MM-DD HH:mm');
        if (this.inputEndDate.value?.isBefore(val)) {
          this.lbStartDateErr.caption = 'Start time cannot be earlier than end time';
        }
      } else {
        inputEndDate.min = undefined;
      }
    }
  }

  private onEndDateChanged = (elm: Datepicker) => {
    const value = elm?.value;
    const inputStartDate = this.inputStartDate.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    this.lbStartDateErr.caption = '';
    this.lbEndDateErr.caption = '';
    if (inputStartDate) {
      if (value) {
        const date = moment(value, 'DD/MM/YYYY HH:mm');
        const val = date;
        inputStartDate.max = val.format('YYYY-MM-DD HH:mm');
        if (this.inputStartDate.value?.isAfter(value)) {
          this.lbEndDateErr.caption = 'End time cannot be earlier than start time';
        }
      } else {
        inputStartDate.max = moment().format('YYYY-MM-DD HH:mm');
      }
    }
  }

  private initInputDate() {
    const inputStartDate = this.inputStartDate.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    const inputEndDate = this.inputEndDate.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    if (inputStartDate) inputStartDate.max = moment().format('YYYY-MM-DD HH:mm');
    if (inputEndDate) inputEndDate.max = moment().format('YYYY-MM-DD HH:mm');
  }

  private onClearSearch() {
    this.inputCommitId.value = '';
    this.inputMessage.value = '';
    this.inputStartDate.value = undefined;
    this.inputEndDate.value = undefined;
    this.onStartDateChanged(undefined);
    this.onEndDateChanged(undefined);
  }

  private async onSyncCommits() {
    await this.onRefreshData(true);
    if (!this.packageInfo) {
      const { name, owner_login } = this.data;
      this.packageInfo = await getPackageByNames(owner_login, name);
    }
    await this.onSearchCommits();
  }

  private async onSearchCommits() {
    this.btnSync.enabled = false;
    this.btnSearch.enabled = false;
    this.btnClear.enabled = false;
    this.pagiCommitList.currentPage = 1;
    await this.getCommits();
    this.btnSync.enabled = true;
    this.btnSearch.enabled = true;
    this.btnClear.enabled = true;
  }

  private async getCommits() {
    if (!this.packageInfo) return;
    const packageGuid = this.packageInfo.guid;
    const filter = {
      packageGuid,
      commitId: this.inputCommitId.value,
      message: this.inputMessage.value,
      startDate: this.inputStartDate.value?.format('YYYY-MM-DDTHH:mm:ss\\Z') || '',
      endDate: this.inputEndDate.value?.format('YYYY-MM-DDTHH:mm:ss\\Z') || ''
    }
    const currentPage = this.pagiCommitList.currentPage;
    const { list, total } = await getCommits(currentPage, this.pageSize, filter);
    this.commits = list;
    this.totalCommits = total;
    this.pagiCommitList.visible = total > 0;
    this.pagiCommitList.totalPages = Math.ceil(total / this.pageSize) || 1;
    this.renderCommits();
  }

  private async getAllPRs() {
    const { name, owner_login } = this.data;
    const result = await getAllPulls(owner_login, name);
    if (result?.data) {
      const resultPRList = await getAuditPRList(name);
      if (resultPRList?.data) {
        this.listAuditPr = resultPRList.data;
      }
      this.listPR = result.data.map((v: any) => {
        const { commit_sha, number } = v;
        const auditPr = this.listAuditPr.find(f => f.mergeSHA === commit_sha && f.mergeNumber === number);
        return {
          ...v,
          mergeId: auditPr?.mergeId,
          status: auditPr?.auditStatus || PackageStatus.AUDITING
        }
      });
    } else {
      this.listPR = [];
    }
  }

  private async onShowDetail() {
    this.isDetailShown = !this.isDetailShown;
    this.iconDetail.name = this.isDetailShown ? 'angle-up' : 'angle-down';
    this.tabs.visible = this.isDetailShown;
    if (!this.isDetailShown) return;
    this.tabs.activeTabIndex = 0;
    if (!this.totalCommits) {
      await this.getCommits()
    }
    await this.refreshPR(this.listPR.length > 0);
  }

  private async onRefreshData(commit?: boolean) {
    this.iconRefresh.enabled = false;
    this.iconDetail.enabled = false;
    const { name, owner_login } = this.data;
    await syncCommits(owner_login, name);
    if (!commit) await this.refreshPR();
    this.iconRefresh.enabled = true;
    this.iconDetail.enabled = true;
  }

  private async refreshPR(hasData?: boolean) {
    this.lastCommitId = '';
    this.iconRefresh.enabled = false;
    this.iconDetail.enabled = false;
    if (!hasData) await this.getAllPRs();
    this.renderListPR();
    this.iconRefresh.enabled = true;
    this.iconDetail.enabled = true;
  }

  private renderCommits() {
    this.tabCommits.caption = `Commits <span style="color: var(--colors-primary-main)">(${this.totalCommits})</span>`;
    let nodeItems: HTMLElement[] = [];
    const { guid } = this.packageInfo;
    for (const commit of this.commits) {
      const { committer, message, sha, url, version, date, auditStatus } = commit;
      nodeItems.push(<i-hstack
        gap="0.625rem"
        margin={{ bottom: '1rem' }}
        padding={{ top: '0.75rem', bottom: '0.75rem', left: '0.75rem', right: '0.75rem' }}
        background={{ color: 'linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.07))' }}
        boxShadow="0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)"
        border={{ radius: '0.375rem' }}
        verticalAlignment="center"
        horizontalAlignment="space-between"
      >
        <i-vstack gap="0.5rem" verticalAlignment="center" maxWidth="calc(100% - 200px)">
          <i-hstack gap="0.5rem">
            <i-label caption={message} wordBreak="break-word" font={{ size: '0.875rem', bold: true }} />
            <i-icon name="external-link-alt" class="icon-hover" cursor="pointer" width="0.9rem" height="0.9rem" onClick={() => this.openLink(url)} />
          </i-hstack>
          <i-label caption={`Version: ${version || '-'}`} font={{ size: '0.875rem' }} />
          <i-label caption={`${committer} committed ${getTimeAgo(date)}`} font={{ size: '0.75rem' }} opacity={0.8} />
        </i-vstack>
        <i-hstack gap="1rem" verticalAlignment="center" wrap="wrap">
          {auditStatus ? <i-label
            caption={this.getStatusText(auditStatus)}
            font={{ size: '0.875rem' }}
            background={{ color: this.getStatusColor(auditStatus) }}
            border={{ radius: '1rem' }}
            padding={{ left: '0.625rem', right: '0.625rem', top: '0.3125rem', bottom: '0.3125rem' }}
            minWidth={'5.5rem'}
            class="text-center"
          /> : []}
          {auditStatus && auditStatus !== PackageStatus.AUDITING ? <i-button
            caption="View Record"
            background={{ color: '#212128' }}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            rightIcon={{ spin: true, visible: false }}
            onClick={() => this.onViewCommitRecord(commit.guid)}
          /> : []}
          {this.isAuditPR && auditStatus === PackageStatus.AUDITING ? <i-button
            caption={'Audit'}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            rightIcon={{ spin: true, visible: false }}
            onClick={() => this.onAuditCommit(commit.guid)}
          /> : []}
          {this.isProject && this.isProjectOwner && !auditStatus ? <i-button
            id={`btn-${sha}`}
            caption={'Submit for Audit'}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            rightIcon={{ spin: true, visible: false }}
            onClick={() => this.onShowRequestAudit(commit.guid, guid, sha, version)}
          /> : []}
          {this.isProject && this.isProjectOwner && auditStatus === PackageStatus.AUDIT_PASSED ? <i-button
            caption={'Publish'}
            padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
            onClick={() => this.onPublish(commit.guid)}
          /> : []}
        </i-hstack>
      </i-hstack>);
    }
    if (!nodeItems.length) {
      nodeItems.push(<i-hstack
        gap="0.625rem"
        margin={{ bottom: '1rem' }}
        padding={{ top: '0.75rem', bottom: '0.75rem', left: '0.75rem', right: '0.75rem' }}
        background={{ color: 'linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.07))' }}
        boxShadow="0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)"
        border={{ radius: '0.375rem' }}
        verticalAlignment="center"
        horizontalAlignment="center"
      >
        <i-label caption="There is no commit" />
      </i-hstack>)
    }
    this.vStackListCommit.clearInnerHTML();
    this.vStackListCommit.append(...nodeItems);
  }

  private onViewCommitRecord(guid: string) {
    this.viewReportModal.visible = true;
    this.auditReport.prInfo = undefined;
    this.auditReport.commitGuid = guid;
    this.auditReport.scrollTop = 0;
  }

  private onViewRecord(mergeId: string, owner: string, repo: string, prNumber: string) {
    this.viewReportModal.visible = true;
    this.auditReport.commitGuid = undefined;
    this.auditReport.prInfo = { mergeId, owner, repo, prNumber };
    this.auditReport.scrollTop = 0;
  }

  private async onAuditCommit(guid: string) {
    let queries = new URLSearchParams({ guid }).toString();
    window.location.href = `#/audit-commit-form?${queries}`;
  }

  private async onAuditPR(owner: string, repo: string, prNumber: string) {
    let queries = new URLSearchParams({ owner, repo, prNumber }).toString();
    window.location.href = `#/review-pr-form?${queries}`;
  }

  private async onMergePR(button: Button, owner: string, repo: string, prNumber: number, status: PackageStatus) {
    if (status === PackageStatus.AUDITING) {
      this.mergeOnePR(button, owner, repo, prNumber);
    } else {
      this.setMessage({
        status: 'confirm',
        title: 'Merge pull request',
        content: this.getStatusMessage(status, prNumber, repo),
        onConfirm: () => this.mergeOnePR(button, owner, repo, prNumber)
      })
      this.mdAlert.showModal();
    }
  }

  private async mergeOnePR(button: Button, owner: string, repo: string, prNumber: number) {
    this.setMessage({
      status: 'warning',
      title: 'Merge',
      content: 'Merging...',
    })
    this.mdAlert.showModal();
    button.caption = 'Merging';
    button.enabled = false;
    button.rightIcon.visible = true;
    const showError = (msg?: string) => {
      this.setMessage({
        status: 'error',
        title: 'Error',
        content: msg || 'Failed to merge'
      })
      this.mdAlert.showModal();
      button.caption = 'Merge';
      button.enabled = true;
      button.rightIcon.visible = false;
    }
    try {
      const wallet = Wallet.getClientInstance();
      let message = '';
      if (this.guid) {
        const { data } = await getMergeMsg(this.guid, owner, repo);
        if (!data) {
          showError('Failed to get message');
          return;
        }
        message = btoa(data);
      } else {
        message = btoa(`owner:${owner}-repo:${repo}`);
      }
      const signature = await wallet.signMessage(message);
      const result = await mergePR(this.guid ? wallet.address : undefined, signature, owner, repo, prNumber);
      if (!result || result.error) {
        showError(result.error);
      } else {
        this.setMessage({
          status: 'success',
          title: 'Success',
          content: 'Merged successfully'
        })
        this.mdAlert.showModal();
        const oldPRs = Number(this.listPR.length);
        await this.getAllPRs();
        if (this.listPR.length === 0 && this.guid) {
          await this.onRefresh();
        } else {
          button.caption = 'Merged';
          button.enabled = false;
          button.rightIcon.visible = false;
          this.refreshPR(true);
          if (this.guid && this.updateCountPRs) {
            this.updateCountPRs(oldPRs, this.listPR.length);
          }
        }
      }
    } catch (error) {
      showError();
    }
  }

  private async onShowRequestAudit(commitGuid: string, packageGuid: string, sha: string, version: string) {
    if (this.isProject && this.isProjectOwner) {
      this.selectedCommit = {
        commitGuid,
        packageGuid,
        sha,
        version
      }
      this.lbCommitId.caption = sha;
      this.lbCommitVersion.caption = version;
      this.mdPublish.visible = true;
    }
  }

  private onClosePublish() {
    this.mdPublish.visible = false;
  }

  private resetPublishInfo() {
    this.lbCommitId.caption = '';
    this.lbCommitVersion.caption = '';
    this.btnPublish.caption = 'Submit for Audit';
    this.btnPublish.enabled = true;
    this.btnPublish.rightIcon.visible = false;
    this.mdPublish.visible = false;
  }

  private async onPublish(guid: string) {
    window.location.assign(`/#/publish-commit/${guid}`);
  }

  private async onRequestAudit() {
    if (this.isProject && this.isProjectOwner) {
      this.setMessage({
        status: 'warning',
        title: 'Submit',
        content: 'Submitting...',
      })
      this.mdAlert.showModal();
      this.btnPublish.caption = 'Submitting';
      this.btnPublish.enabled = false;
      this.btnPublish.rightIcon.visible = true;
      const showError = (msg?: string) => {
      this.setMessage({
          status: 'error',
          title: 'Error',
          content: msg || 'Failed to submit'
        })
        this.mdAlert.showModal();
        this.btnPublish.caption = 'Submit for Audit';
        this.btnPublish.enabled = true;
        this.btnPublish.rightIcon.visible = false;
      }
      try {
        const { name, owner_login } = this.data;
        const { commitGuid, sha, packageGuid, version } = this.selectedCommit;
        const commitInfo = {
          commitGuid,
          packageGuid,
          packageName: name,
          packageOwner: owner_login,
          sha,
          version,
          projectGuid: this.guid,
          projectId: this.projectId
        }

        const semver = version.split('.').map((v: string) => Number(v));
        const finVersion: ISemanticVersion = {
          major: semver[0],
          minor: semver[1],
          patch: semver[2]
        }

        let packageVersionId, packageId;
        const requestedAudit = this.commits.filter(f => f.auditStatus);
        let isOldVersion = requestedAudit.length ? requestedAudit.every((v: any) => !compareVersions(v.version, version)) : false;
        if (isOldVersion) {
          showError('Cannot submit an old version');
          return;
        }
        else {
          let isCurrentVersion = requestedAudit.find((v: any) => {
            const ver = v.version.split('.').map((v: string) => Number(v));
            return ver[0] === finVersion.major && ver[1] === finVersion.minor && ver[2] === finVersion.patch && v.auditStatus !== PackageStatus.AUDIT_FAILED;
          });
          if (isCurrentVersion) {
            showError('This version has already been submitted');
            return;
          }
        }

        const ipfsCid = await uploadDataToIpfs('commitDetail', JSON.stringify(commitInfo, null, 2));
        if (!ipfsCid) {
          showError('Failed to upload data to IPFS');
          return;
        }
        const callback = async (err: Error, receipt?: string) => {
          if (err) {
            showError(parseContractError(err.message));
            this.getCommits();
          } else if (receipt) {
            this.setMessage({
              status: 'success',
              title: 'Transaction Submitted',
              link: {
                caption: receipt,
                href: getExplorerTxUrl(receipt)
              }
            })
            this.mdAlert.showModal();
          }
        }

        const confirmationCallback = async (receipt: any) => { }

        const confirmationForPublishing = async (receipt?: any, hideStatus?: boolean) => {
          const result = await requestAuditCommit(commitGuid, this.guid, this.projectId, packageId, packageVersionId, version, sha, !!receipt);
          if (result?.success) {
            if (hideStatus) return;
            await this.getCommits();
            this.resetPublishInfo();
            this.setMessage({
              status: 'success',
              title: 'Success',
              content: 'Submitted successfully'
            });
            this.mdAlert.showModal();
          } else {
            showError(result?.error?.message);
          }
        }
        if (this.packageInfo.packageId && this.packageInfo.packageVersionId) {
          packageVersionId = this.packageInfo.packageVersionId;
          packageId = this.packageInfo.packageId;
          await updatePackageVersionIpfsCid(packageVersionId, packageId, ipfsCid, callback, confirmationCallback);
          await confirmationForPublishing();
        } else if (this.packageInfo.packageId) {
          packageId = this.packageInfo.packageId;
          const verData = await createNewPackageVersion(this.projectId, packageId, finVersion, ipfsCid, callback, confirmationCallback);
          this.packageInfo.packageVersionId = verData.packageVersionId;
          packageVersionId = verData.packageVersionId;
          await confirmationForPublishing(undefined, true); // Store packageVersionId
          await updatePackageVersionToAuditing(packageVersionId, callback, confirmationForPublishing);
        } else {
          const data = await createNewPackage(this.projectId, name, ipfsCid, 'PackageType', callback, confirmationCallback);
          packageId = data.packageId;
          this.packageInfo.packageId = data.packageId;
          await confirmationForPublishing(undefined, true); // Store packageId
          const verData = await createNewPackageVersion(this.projectId, packageId, finVersion, ipfsCid, callback, confirmationCallback);
          packageVersionId = verData.packageVersionId;
          await confirmationForPublishing(undefined, true); // Store packageVersionId
          await updatePackageVersionToAuditing(packageVersionId, callback, confirmationForPublishing);
        }
      } catch (error) {
        showError();
      }
    }
  }

  private openLink(link: string) {
    return window.open(link, '_blank');
  }

  onHide() {
    this.clearListTimer();
    clearInterval(this.timer);
  }

  private onOpenBuilder() {
    const repoName = this.data?.full_name;
    if (typeof this.onEdit === 'function') {
      this.onEdit(repoName);
    }
  }

  init() {
    super.init();
    this.isInitialized = true;
    this.pagiCommitList.currentPage = 1;
    this.pagiCommitList.onPageChanged = () => this.getCommits();
    this.initInputDate();
    this.renderUI();
  }

  render() {
    return (
      <i-vstack
        width="100%"
        height="100%"
        verticalAlignment="center"
        padding={{ left: '1rem', right: '1rem' }}
      >
        <i-hstack gap="0.625rem" verticalAlignment="center" horizontalAlignment="space-between">
          <i-hstack gap="0.3rem" width="calc(100% - 11rem)" minWidth="15rem" padding={{ top: '1rem', bottom: '1rem' }} verticalAlignment="center" wrap="wrap">
            <i-vstack gap="0.5rem" width="48%">
              <i-hstack gap="0.5rem">
                <i-label id="lbName" font={{ size: '1.125rem', bold: true }} />
              </i-hstack>
              <i-hstack id="hStackLink" gap="0.5rem" width="fit-content" cursor="pointer" class="icon-hover">
                <i-label id="lbPath" font={{ size: '0.75rem' }} opacity={0.8} />
                <i-icon name="external-link-alt" width="0.85rem" height="0.85em" minWidth="0.85rem" />
              </i-hstack>
            </i-vstack>
            <i-hstack width="3rem" horizontalAlignment="center">
              <i-label id="lbVersion" font={{ size: '0.875rem' }} />
            </i-hstack>
            <i-hstack width="5rem" minWidth="5rem" horizontalAlignment="center">
              <i-hstack id="hStackCount" gap="0.5rem" width="fit-content" verticalAlignment="center" tooltip={{ trigger: 'hover', content: 'Pull requests' }}>
                <i-icon name="retweet" width="1.25rem" height="1.25rem" opacity={0.8} />
                <i-label
                  id="lbCount"
                  lineHeight={1}
                  font={{ size: '0.75rem', color: Theme.colors.primary.contrastText }}
                  background={{ color: Theme.colors.primary.main }}
                  border={{ radius: '0.625rem' }}
                  padding={{ left: '0.3rem', right: '0.3rem', top: '0.125rem', bottom: '0.125rem' }}
                />
              </i-hstack>
            </i-hstack>
            <i-hstack gap="0.5rem" width="calc(52% - 9rem)" minWidth="11rem" verticalAlignment="center">
              <i-label id="lbPushedAt" font={{ size: '0.875rem' }} opacity={0.8} />
              <i-icon id="iconRefresh" name="sync-alt" class="icon-hover" cursor="pointer" width="0.9rem" height="0.9rem" minWidth="0.9rem" onClick={() => this.onRefreshData()} />
            </i-hstack>
          </i-hstack>
          <i-button
            id="btnEdit"
            caption="Edit"
            stack={{ shrink: '0' }}
            icon={{ name: 'pen', width: '0.675rem', height: '0.675rem' }}
            padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.75rem', right: '0.75rem' }}
            font={{ color: Theme.colors.primary.contrastText }}
            background={{ color: '#17a2b8' }}
            onClick={this.onOpenBuilder}
          />
          <i-icon id="iconDetail" name="angle-down" class="icon-expansion" cursor="pointer" width="1.75rem" height="1.75rem" onClick={this.onShowDetail} />
        </i-hstack>
        <i-tabs
          id="tabs"
          visible={false}
          class={childTabStyle}
          width="100%"
          height="100%"
          mode="horizontal"
          position="relative"
          zIndex={0}
        >
          <i-tab id="tabPRs" caption="PRs" width="50%">
            <i-vstack id="vStackListPR" verticalAlignment="center" />
          </i-tab>
          <i-tab id="tabCommits" caption="Commits" width="50%">
            <i-vstack gap="1rem" verticalAlignment="center">
              <i-vstack gap="1rem" width="100%">
                <i-hstack gap="2rem" verticalAlignment="center" wrap="wrap" width="100%" mediaQueries={[{maxWidth: '767px', properties: {gap: '1rem'}}]}>
                  <i-hstack gap="0.5rem" verticalAlignment="center" horizontalAlignment="space-between" minWidth="calc(50% - 1rem)" stack={{grow: '1'}}>
                    <i-label caption="Commit ID" minWidth={80}/>
                    <i-input id="inputCommitId" class={inputStyle} height={40} width="calc(100% - 75px)" />
                  </i-hstack>
                  <i-hstack gap="0.5rem" verticalAlignment="center" horizontalAlignment="space-between" minWidth="calc(50% - 1rem)" stack={{grow: '1'}}>
                    <i-label caption="Title" minWidth={80} />
                    <i-input id="inputMessage" class={inputStyle} height={40} width="calc(100% - 75px)" />
                  </i-hstack>
                </i-hstack>
                <i-hstack gap="1rem" verticalAlignment="center" wrap="wrap" width="100%" mediaQueries={[{maxWidth: '767px', properties: {gap: '1rem'}}]}>
                  <i-hstack gap="0.5rem" verticalAlignment="center" horizontalAlignment="space-between" minWidth="calc(50% - 1rem)" stack={{grow: '1'}}>
                    <i-label caption="Start Date" minWidth={80} />
                    <i-vstack gap="0.25rem" width="calc(100% - 75px)">
                      <i-datepicker id="inputStartDate" type="dateTime" placeholder="dd/mm/yyyy hh:mm" class={inputDateStyle} height={40} width="100%" onChanged={this.onStartDateChanged} />
                      <i-label id="lbStartDateErr" font={{ color: Theme.colors.error.main }} />
                    </i-vstack>
                  </i-hstack>
                  <i-hstack gap="0.5rem" verticalAlignment="center" horizontalAlignment="space-between" minWidth="calc(50% - 1rem)" stack={{grow: '1'}}>
                    <i-label caption="End Date" minWidth={80} />
                    <i-vstack gap="0.25rem" width="calc(100% - 75px)">
                      <i-datepicker id="inputEndDate" type="dateTime" placeholder="dd/mm/yyyy hh:mm" class={inputDateStyle} height={40} width="100%" onChanged={this.onEndDateChanged} />
                      <i-label id="lbEndDateErr" font={{ color: Theme.colors.error.main }} />
                    </i-vstack>
                  </i-hstack>
                </i-hstack>
                <i-hstack gap="1rem" verticalAlignment="center" horizontalAlignment="end" wrap="wrap">
                  <i-button
                    id="btnSync"
                    caption="Sync"
                    width="10rem"
                    padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.75rem', right: '0.75rem' }}
                    background={{ color: '#17a2b8' }}
                    onClick={this.onSyncCommits}
                  />
                  <i-button
                    id="btnSearch"
                    caption="Search"
                    width="10rem"
                    padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.75rem', right: '0.75rem' }}
                    background={{ color: '#17a2b8' }}
                    onClick={this.onSearchCommits}
                  />
                  <i-button
                    id="btnClear"
                    caption="Clear"
                    width="10rem"
                    padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.75rem', right: '0.75rem' }}
                    background={{ color: '#17a2b8' }}
                    onClick={this.onClearSearch}
                  />
                </i-hstack>
              </i-vstack>
              <i-vstack id="vStackListCommit" verticalAlignment="center" />
              <i-vstack horizontalAlignment='center'>
                <i-pagination id="pagiCommitList" width="auto" margin={{ top: '1rem' }} pageSize={this.pageSize} />
              </i-vstack>
            </i-vstack>
          </i-tab>
        </i-tabs>
        <i-modal id="mdPublish" class={modalStyle} maxWidth="600px">
          <i-vstack
            width="100%"
            gap="0.625rem"
            padding={{ top: '1.5rem', bottom: '1.5rem', left: '1.5rem', right: '1.5rem' }}
          >
            <i-hstack gap="1rem" horizontalAlignment="space-between" verticalAlignment="center">
              <i-label id="lbPublish" font={{ size: '1rem', bold: true, color: Theme.colors.primary.main }} />
              <i-icon name="times" fill={Theme.colors.primary.main} width="1.25rem" height="1.25rem" cursor="pointer" onClick={this.onClosePublish} />
            </i-hstack>
            <i-vstack width="100%" gap="0.5rem" margin={{ top: '1rem' }}>
              <i-hstack gap="0.5rem" verticalAlignment="center" margin={{ bottom: '0.25rem' }}>
                <i-label caption="Branch:" />
                <i-label caption="main" font={{ size: '1rem', color: Theme.colors.primary.main }} />
              </i-hstack>
              <i-hstack gap="0.5rem" verticalAlignment="center">
                <i-label caption="Version:" />
                <i-label id="lbCommitVersion" font={{ size: '1rem', color: Theme.colors.primary.main }} />
              </i-hstack>
              <i-hstack gap="0.5rem" verticalAlignment="center">
                <i-label caption="Commit ID (SHA):" />
                <i-label id="lbCommitId" font={{ size: '1rem', color: Theme.colors.primary.main }} />
              </i-hstack>
            </i-vstack>
            <i-button
              id="btnPublish"
              caption="Submit for Audit"
              width="12.5rem"
              margin={{ top: '1rem', left: 'auto', right: 'auto' }}
              padding={{ top: '0.25rem', bottom: '0.25rem', left: '0.75rem', right: '0.75rem' }}
              rightIcon={{ spin: true, visible: false }}
              onClick={() => this.onRequestAudit()}
            />
          </i-vstack>
        </i-modal>
        <i-modal
          id='viewReportModal'
          maxWidth="55rem"
          title="Audit Report"
          closeIcon={{ name: 'times' }}
          popupPlacement="center"
        >
          <i-panel padding={{ top: '1rem', bottom: '1rem' }}>
            <i-scom-widget-repos--audit-report
              id="auditReport"
              isPopup={true}
              display="block"
              height='calc(100vh - 68px)' overflow={{ y: 'auto' }}
            />
          </i-panel>
        </i-modal>
        <i-alert id="mdAlert" />
      </i-vstack>
    )
  }
}